import type { Enemy } from './enemies';
import type { HeroLink } from '../systems/heroActivation';
import type { Unit } from '../systems/items';
import { statusConfig } from '../config/heroes';
import type { PercentDamage } from './specialDamage';

export type DamageSource = 'basic' | 'skill' | 'dot';
export interface EnemyEffect {
  kind: 'stun' | 'slow' | 'poison' | 'vulnerable'; source: HeroLink; remaining: number;
  amount: number; interval: number; elapsed: number;
  maxHpPercentPerTick?: number;
}
interface AttackBuff { source: HeroLink; remaining: number; damage: number; speed: number; specialMultiplier: number }
export type BattleAlly = Unit | HeroLink;

// 每个CombatSimulation独立持有；计时只由固定逻辑步推进，绝不改写基础属性。
export class StatusEffects {
  readonly enemies = new Map<Enemy, EnemyEffect[]>();
  readonly allies = new Map<BattleAlly, Map<HeroLink, AttackBuff>>();
  addEnemy(enemy: Enemy, effect: Omit<EnemyEffect, 'elapsed'>): void {
    const effects = this.enemies.get(enemy) ?? [];
    const old = effects.findIndex(e => e.source === effect.source && e.kind === effect.kind);
    if (old >= 0) effects.splice(old, 1);
    effects.push({ ...effect, elapsed: 0 }); this.enemies.set(enemy, effects);
  }
  buff(ally: BattleAlly, source: HeroLink, duration: number, damage: number, speed: number, specialMultiplier = 1): void {
    const buffs = this.allies.get(ally) ?? new Map<HeroLink, AttackBuff>();
    buffs.set(source, { source, remaining: duration, damage, speed, specialMultiplier }); this.allies.set(ally, buffs);
  }
  specialDamageMultiplier(ally: HeroLink): number {
    // 同类来源取最高有效增幅，一次特殊命中只应用一次。
    return Math.max(1, ...[...(this.allies.get(ally)?.values() ?? [])].map(buff => buff.specialMultiplier));
  }
  damageMultiplier(enemy: Enemy): number {
    return 1 + Math.max(0, ...(this.enemies.get(enemy) ?? [])
      .filter(effect => effect.kind === 'vulnerable' && effect.remaining > 0).map(effect => effect.amount));
  }
  basicStats<T extends {damage:number;attackInterval:number}>(ally: BattleAlly, stats:T):T {
    const buffs = [...(this.allies.get(ally)?.values() ?? [])];
    return {...stats, damage:stats.damage * (1 + buffs.reduce((n,b)=>n+b.damage,0)),
      attackInterval:stats.attackInterval / (1 + buffs.reduce((n,b)=>n+b.speed,0))};
  }
  sync(enemies: readonly Enemy[], allies: readonly BattleAlly[], active: (link:HeroLink)=>boolean):void {
    for(const [enemy,effects] of this.enemies) {
      const live=effects.filter(e=>active(e.source));
      if(enemy.hp<=0 || !enemies.includes(enemy) || !live.length)this.enemies.delete(enemy);
      else this.enemies.set(enemy,live);
    }
    for(const [ally,buffs] of this.allies) {
      for(const source of buffs.keys())if(!active(source))buffs.delete(source);
      if(!allies.includes(ally)||!buffs.size)this.allies.delete(ally);
    }
  }
  tickBuffs(dt:number):void {
    for(const [ally,buffs] of this.allies) {
      for(const [source,buff] of buffs)if((buff.remaining-=dt)<=1e-8)buffs.delete(source);
      if(!buffs.size)this.allies.delete(ally);
    }
  }
  // 返回此步有效移动秒数；跨状态到期点分段积分，眩晕不冻结DOT/slow的时间。
  tickEnemy(enemy:Enemy,dt:number,hit:(damage:number,source:HeroLink,special?:PercentDamage)=>void):number {
    const effects=this.enemies.get(enemy)??[];
    const boundaries=[0,...effects.map(e=>e.remaining).filter(t=>t>0&&t<dt),dt].sort((a,b)=>a-b);
    let moveMs=0;
    for(let i=1;i<boundaries.length;i++) {
      const start=boundaries[i-1]!,end=boundaries[i]!;
      const live=effects.filter(e=>e.remaining>start+1e-8);
      const ratio=live.some(e=>e.kind==='stun')?0:Math.max(statusConfig.minimumMoveSpeedRatio,
        live.filter(e=>e.kind==='slow').reduce((factor,e)=>factor*(1-e.amount),1));
      moveMs+=(end-start)*ratio;
    }
    for(const effect of effects) {
      if(effect.kind==='poison') {
        effect.elapsed+=Math.min(dt,effect.remaining);
        while(effect.elapsed+1e-8>=effect.interval&&enemy.hp>0){
          effect.elapsed-=effect.interval;
          hit(effect.amount,effect.source,effect.maxHpPercentPerTick
            ? { basis: 'maxHp', ratio: effect.maxHpPercentPerTick } : undefined);
        }
      }
      effect.remaining-=dt;
    }
    const live=effects.filter(e=>e.remaining>1e-8);
    if(live.length&&enemy.hp>0)this.enemies.set(enemy,live);else this.enemies.delete(enemy);
    return moveMs/1000;
  }
  clear():void {this.enemies.clear();this.allies.clear();}
}
