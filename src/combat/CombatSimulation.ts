import { itemAttackInterval } from '../config/itemEffects';
import { combatConfig, getCombatStats } from '../config/combat';
import type { CombatConfig } from '../config/combat';
import type { BoardMap, MapPoint } from '../config/maps';
import type { BoardState } from '../systems/board';
import type { Unit } from '../systems/items';
import { isUnit } from '../systems/items';
import { buildPath } from './path';
import { advanceEnemy, createEnemy, damageEnemy } from './enemies';
import type { Enemy } from './enemies';
import { inRange, lineEnd, piercingTargets, selectTarget } from './targeting';
import type { WaveProgress } from './WaveProgress';
import { getHeroLinks } from '../systems/heroActivation';
import type { HeroLink } from '../systems/heroActivation';
import { getHeroStats, getHeroDefinition } from '../config/heroes';
import { getHeroProgression } from '../systems/heroProgression';
import { updateHeroSkill, heroAttackInterval, consumeEmpoweredAttack, heroBasicDamageMultiplier } from './skills';
import type { SkillEvent } from './skills';
import { StatusEffects } from './statusEffects';
import type { DamageSource } from './statusEffects';
import { applyTileBonuses } from './tileBonuses';

interface Attacker {
  unit: Unit;
  type: Unit['type'];
  level: number;
  cooldown: number;
  interval: number;
}

export interface AttackEffect {
  kind: 'attack';
  tileIndex: number;
  unit: Unit;
  level: number;
  type: Unit['type'];
  origin: MapPoint;
  end: MapPoint;
  range: number;
}

export interface Projectile extends MapPoint {
  id: number;
  tileIndex: number;
  unit: Unit;
  level: number;
  targetId: number;
  damage: number;
  range: number;
}

export type CombatEvent = AttackEffect | SkillEvent
  | { kind: 'heroAttack'; link: HeroLink; end: MapPoint }
  | { kind: 'hit'; enemyId: number; source: DamageSource; damage: number; heroId?: HeroLink['heroId'] }
  | { kind: 'kill'; enemyId: number; position: MapPoint; reward: number }
  | { kind: 'escape'; enemyId: number };

// 无 Phaser 依赖：地图、棋盘和钱包由外部提供，待放置栏从不进入索敌流程。
export class CombatSimulation {
  readonly path;
  readonly map: BoardMap;
  readonly board: BoardState;
  readonly config: CombatConfig;
  private readonly wallet: { money: number };
  readonly statuses = new StatusEffects();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  private readonly attackers = new Map<number, Attacker>();
  private readonly heroAttackers = new Map<string, { link: HeroLink; cooldown: number; interval: number }>();
  private elapsed = 0;
  readonly progress: WaveProgress | null;
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private suspendedTile: number | null = null;

  constructor(
    map: BoardMap,
    board: BoardState,
    wallet: { money: number },
    config: CombatConfig = combatConfig,
    progress: WaveProgress | null = null,
  ) {
    this.progress = progress;
    this.map = map;
    this.board = board;
    this.wallet = wallet;
    this.config = config;
    this.path = buildPath(map.path);
  }

  spawnEnemy(hpMultiplier = 1): Enemy {
    const enemy = createEnemy(this.nextEnemyId++, this.path, {
      ...this.config.enemy, maxHp: Math.round(this.config.enemy.maxHp * hpMultiplier),
    });
    this.enemies.push(enemy);
    return enemy;
  }

  // 由运行时所有者在退出本局时释放，不承担重开/波次规则。
  destroy(): void {
    this.statuses.clear();
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.attackers.clear();
    this.heroAttackers.clear();
    this.elapsed = 0;
    this.suspendedTile = null;
  }

  isAttackerValid(tileIndex: number, unit: Unit, level: number): boolean {
    const tile = this.board.tiles[tileIndex];
    return tileIndex !== this.suspendedTile && !!tile?.unlocked && tile.unit === unit && unit.level === level;
  }

  syncBoard(suspendedTile: number | null = null): void {
    this.suspendedTile = suspendedTile;
    getHeroProgression(this.board).sync(suspendedTile);
    const links = this.heroLinks;
    for (const [key, state] of this.heroAttackers) {
      if (!links.some(link => link.key === key && link === state.link)) this.heroAttackers.delete(key);
    }
    for (const link of links) {
      if (!this.heroAttackers.has(link.key)) {
        const interval = applyTileBonuses(getHeroStats(link.level, link.heroId), this.board,
          [link.leftIndex, link.rightIndex]).attackInterval;
        this.heroAttackers.set(link.key, { link, cooldown: interval, interval });
      }
    }
    for (const [index, attacker] of this.attackers) {
      if (!this.isAttackerValid(index, attacker.unit, attacker.level) || attacker.unit.type !== attacker.type) {
        this.attackers.delete(index);
      }
    }
    this.board.tiles.forEach((tile, index) => {
      if (!isUnit(tile.unit) || !tile.unlocked || index === suspendedTile || this.attackers.has(index)) return;
      const interval = applyTileBonuses(getCombatStats(tile.unit), this.board, [index]).attackInterval;
      this.attackers.set(index, {
        unit: tile.unit, type: tile.unit.type, level: tile.unit.level,
        cooldown: interval, interval,
      });
    });
    this.statuses.sync(this.enemies, [...this.attackers.values()].map(a=>a.unit as Unit|HeroLink).concat(links),
      link=>getHeroProgression(this.board).isActive(link));
    this.projectiles = this.projectiles.filter(arrow => this.isAttackerValid(arrow.tileIndex, arrow.unit, arrow.level));
  }

  update(deltaMs: number, suspendedTile: number | null = null): CombatEvent[] {
    if (this.progress && this.progress.status !== 'playing') return [];
    this.syncBoard(suspendedTile);
    const events: CombatEvent[] = [];
    this.elapsed += Math.max(0, Math.min(deltaMs, this.config.maxFrameMs));
    while (this.elapsed + 1e-8 >= this.config.stepMs) {
      this.step(this.config.stepMs, events);
      this.elapsed -= this.config.stepMs;
      if (this.progress && this.progress.status !== 'playing') {
        this.projectiles = [];
        this.attackers.clear();
        this.heroAttackers.clear();
        getHeroProgression(this.board).clearParticipation();
        getHeroProgression(this.board).clearSkills();
        this.elapsed = 0;
        break;
      }
    }
    return events;
  }

  private hit(enemy: Enemy, damage: number, events: CombatEvent[], hero?: HeroLink, source: DamageSource = 'basic'): void {
    const result = damageEnemy(enemy, damage);
    if (hero) getHeroProgression(this.board).recordDamage(enemy.id, hero, result.applied);
    if (result.applied > 0) events.push({ kind: 'hit', enemyId: enemy.id, source, damage: result.applied, heroId: hero?.heroId });
    if (result.killed) {
      getHeroProgression(this.board).awardKill(enemy.id, hero ?? null);
      this.wallet.money += this.config.enemy.killReward;
      events.push({ kind: 'kill', enemyId: enemy.id, position: { x: enemy.x, y: enemy.y }, reward: this.config.enemy.killReward });
    }
  }

  get heroLinks(): HeroLink[] { return [...getHeroProgression(this.board).links.values()]; }

  isHeroLinkValid(link: HeroLink): boolean {
    return (!this.progress || this.progress.status === 'playing') && getHeroProgression(this.board).isActive(link)
      && getHeroLinks(this.map, this.board, this.suspendedTile, this.heroLinks).some(current =>
      current.key === link.key && current.left === link.left && current.right === link.right);
  }

  private step(deltaMs: number, events: CombatEvent[]): void {
    const seconds = deltaMs / 1000;
    this.statuses.tickBuffs(deltaMs);
    this.progress?.tick(deltaMs, multiplier => this.spawnEnemy(multiplier));
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0) continue;
      const movementSeconds=this.statuses.tickEnemy(enemy,deltaMs,(damage,source)=>this.hit(enemy,damage,events,source,'dot'));
      if (enemy.hp<=0 || !advanceEnemy(enemy, this.path, movementSeconds)) continue;
      events.push({ kind: 'escape', enemyId: enemy.id });
      getHeroProgression(this.board).forgetEnemy(enemy.id);
      this.enemies = this.enemies.filter(candidate => candidate !== enemy);
      this.progress?.escape();
      if (this.progress?.status === 'defeat') return;
    }

    this.projectiles = this.projectiles.filter(arrow => {
      const target = this.enemies.find(enemy => enemy.id === arrow.targetId && enemy.hp > 0);
      const origin = this.map.cells[arrow.tileIndex]!;
      if (!target || !inRange(origin, target, arrow.range)) return false;
      const distance = Math.hypot(target.x - arrow.x, target.y - arrow.y);
      const travel = this.config.arrowSpeed * seconds;
      if (distance <= travel) {
        this.hit(target, arrow.damage, events);
        return false;
      }
      arrow.x += (target.x - arrow.x) / distance * travel;
      arrow.y += (target.y - arrow.y) / distance * travel;
      return true;
    });

    for (const [tileIndex, attacker] of this.attackers) {
      const stats = this.statuses.basicStats(attacker.unit, applyTileBonuses(getCombatStats(attacker.unit), this.board, [tileIndex]));
      attacker.cooldown = Math.max(0, Math.min(attacker.cooldown * stats.attackInterval / attacker.interval,
        stats.attackInterval) - deltaMs);
      attacker.interval = stats.attackInterval;
      if (attacker.cooldown > 1e-8) continue;
      const origin = this.map.cells[tileIndex]!;
      const target = selectTarget(this.enemies, origin, stats.range);
      if (!target) continue;
      attacker.cooldown = stats.attackInterval;
      events.push({
        kind: 'attack', tileIndex, unit: attacker.unit, level: attacker.level, type: attacker.type,
        origin: { x: origin.x, y: origin.y },
        end: attacker.type === '枪' ? lineEnd(origin, target, stats.range) : { x: target.x, y: target.y },
        range: stats.range,
      });
      if (attacker.type === '弓') {
        this.projectiles.push({
          id: this.nextProjectileId++, tileIndex, unit: attacker.unit, level: attacker.level,
          targetId: target.id, damage: stats.damage, range: stats.range, x: origin.x, y: origin.y,
        });
      } else {
        const victims = attacker.type === '枪'
          ? piercingTargets(this.enemies, origin, target, stats.range, this.config.spearWidth)
          : attacker.type === '骑'
            ? this.enemies.filter(enemy => enemy.hp > 0 && inRange(origin, enemy, stats.range))
            : [target];
        victims.forEach(enemy => this.hit(enemy, stats.damage, events));
      }
    }
    for (const attacker of this.heroAttackers.values()) {
      const stats = this.statuses.basicStats(attacker.link, applyTileBonuses(getHeroStats(attacker.link.level, attacker.link.heroId), this.board,
        [attacker.link.leftIndex, attacker.link.rightIndex]));
      const definition=getHeroDefinition(attacker.link.heroId);
      const target = selectTarget(this.enemies, attacker.link.origin, stats.range);
      if(definition.skill.kind==='passive') {
        const focus=attacker.link.focus??={targetId:null,stacks:0};
        if(focus.targetId!==target?.id){focus.targetId=target?.id??null;focus.stacks=0;}
        stats.attackInterval/=1+focus.stacks*definition.skill.effectByLevel[attacker.link.level-1]!.speedPerStack!;
      }
      // 强化结束的当前逻辑步不提前推进新 CD；小美原有打击时序保持不变。
      if (attacker.link.skill?.skillId === 'xiaoliu_haste') {
        updateHeroSkill(attacker.link, this.enemies, deltaMs, () => {}, event => events.push(event), stats.range);
      }
      const interval = itemAttackInterval(heroAttackInterval(attacker.link, stats.attackInterval), attacker.link.hasteEnhanced);
      attacker.cooldown = Math.max(0, Math.min(attacker.cooldown * interval / attacker.interval, interval) - deltaMs);
      attacker.interval = interval;
      if (attacker.cooldown > 1e-8) continue;
      if (!target) continue;
      events.push({ kind: 'heroAttack', link: attacker.link, end: { x: target.x, y: target.y } });
      const victims = definition.attackMode === 'selfArea'
        ? this.enemies.filter(enemy=>enemy.hp>0&&inRange(attacker.link.origin,enemy,stats.range))
        : definition.attackMode === 'splash'
        ? this.enemies.filter(enemy => enemy.hp > 0 && inRange(target, enemy, getHeroDefinition(attacker.link.heroId).combat!.splashRadius)) : [target];
      for (const victim of victims) this.hit(victim, stats.damage*heroBasicDamageMultiplier(attacker.link)
        *(victim!==target && 'splashMultiplier' in definition ? definition.splashMultiplier : 1), events, attacker.link);
      if(definition.skill.kind==='passive'&&attacker.link.focus) {
        attacker.link.focus.stacks=target.hp>0?Math.min(definition.skill.effectByLevel[attacker.link.level-1]!.maxStacks!,attacker.link.focus.stacks+1):0;
      }
      consumeEmpoweredAttack(attacker.link, event => events.push(event));
      attacker.cooldown = interval;
    }
    for (const link of this.heroLinks) {
      if (link.skill?.skillId === 'xiaoliu_haste') continue;
      updateHeroSkill(link, this.enemies, deltaMs,
        (enemy, damage, source) => this.hit(enemy, damage, events, source, 'skill'), event => events.push(event),
        applyTileBonuses(getHeroStats(link.level, link.heroId), this.board, [link.leftIndex, link.rightIndex]).range,
        (source,effect,behavior)=>this.applyHeroEffect(source,effect,behavior));
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
    for(const link of this.heroLinks)if(link.focus && !this.enemies.some(e=>e.id===link.focus!.targetId))link.focus={targetId:null,stacks:0};
    this.progress?.finishStep(this.enemies.length);
  }
  private applyHeroEffect(link:HeroLink, effect:Readonly<Record<string,number>>, behavior:string):void {
    if(behavior==='selfBuff') {this.statuses.buff(link,link,effect.duration!,effect.damageBonus!,effect.speedBonus!);return;}
    if(behavior==='allyBuff') {
      for(const [index,attacker] of this.attackers)if(inRange(link.origin,this.map.cells[index]!,effect.radius!))
        this.statuses.buff(attacker.unit,link,effect.duration!,effect.damageBonus!,effect.speedBonus!);
      for(const ally of this.heroLinks)if(inRange(link.origin,ally.origin,effect.radius!))
        this.statuses.buff(ally,link,effect.duration!,effect.damageBonus!,effect.speedBonus!);
      return;
    }
    for(const enemy of this.enemies.filter(e=>e.hp>0&&inRange(link.origin,e,effect.radius!))) {
      if(behavior==='stun')this.statuses.addEnemy(enemy,{kind:'stun',source:link,remaining:effect.duration!,amount:0,interval:0});
      if(behavior==='poison') {
        this.statuses.addEnemy(enemy,{kind:'poison',source:link,remaining:effect.duration!,amount:effect.dotDamage!,interval:effect.tickInterval!});
        this.statuses.addEnemy(enemy,{kind:'slow',source:link,remaining:effect.duration!,amount:effect.slow!,interval:0});
      }
    }
  }

}
