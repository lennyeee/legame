import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

// 使用真实控制器及范围绘制代码，只替代依赖浏览器的 Phaser 常量和图形对象。
const phaserStub = 'data:text/javascript,' + encodeURIComponent(`export default {
  Scene: class {},
  Math: { Angle: { Between: (x1, y1, x2, y2) => Math.atan2(y2-y1, x2-x1) } },
  Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown', RESUME: 'resume' } },
  Core: { Events: { BLUR: 'blur' } }
};`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'phaser') return { url: phaserStub, shortCircuit: true };
    if (!context.parentURL?.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
  },
});
const { getBattlefieldLayout } = await import('../src/ui/boardLayout.ts');
const { boardProjection, BATTLEFIELD_DIVIDER_PX } = await import('../src/ui/boardDisplay.ts');
const { testMap } = await import('../src/config/maps.ts');
const { createBoardState } = await import('../src/systems/board.ts');
const { BattleController } = await import('../src/combat/BattleController.ts');
const { formatUnitCombatSnapshot } = await import('../src/ui/unitStatsPanel.ts');
const { GameScene } = await import('../src/scenes/GameScene.ts');
const { MatchingScene } = await import('../src/scenes/MatchingScene.ts');
const { createBattleSetup, matchingDuration, flowConfig } = await import('../src/flow/battleSetup.ts');
const { createLoadout, createInventory } = await import('../src/systems/equipment.ts');
const { ReadyScene } = await import('../src/scenes/ReadyScene.ts');
const { ItemsScene } = await import('../src/scenes/ItemsScene.ts');
const { ResultScene } = await import('../src/scenes/ResultScene.ts');
const { ShopScene } = await import('../src/scenes/ShopScene.ts');
const { HowToPlayScene } = await import('../src/scenes/HowToPlayScene.ts');
const { PveOverlayScene } = await import('../src/scenes/PveOverlayScene.ts');
const { pressureConfig, waveStartForWave } = await import('../src/config/pressure.ts');
const { gameConfig } = await import('../src/config/game.ts');
const { recruitmentPool } = await import('../src/systems/recruitment.ts');
function recruitRoll(p, type) {
 if (!p.game.sides && type==='农') return .97;
 const pool=recruitmentPool(p.game.sides?.bottom?.recruitment.loadout ?? {active:[],passive:[]}),total=pool.reduce((sum,item)=>sum+item.weight,0);
 let start=0;
 for(const item of pool){if(item.value===type)return (start+item.weight/2)/total;start+=item.weight;}
 throw new Error(`No recruitment outcome: ${type}`);
}
const { GAME_VERSION } = await import('../src/config/game.ts');
const { setupDevTopSide } = await import('../src/dev/topSetup.ts');
const { READY_BACKGROUND_COLOR } = await import('../src/config/ready.ts');
const { aiConfig } = await import('../src/config/ai.ts');
const { heroCombat, heroRegistry, heroGrowth } = await import('../src/config/heroes.ts');
const { combatConfig } = await import('../src/config/combat.ts');
const { farmerRewardVisual } = await import('../src/config/farmer.ts');
const { FarmerView } = await import('../src/ui/FarmerView.ts');
const { skillConfigs } = await import('../src/config/skills.ts');
const { default: Clock } = await import('../node_modules/phaser/src/time/Clock.js');
const { default: TweenManager } = await import('../node_modules/phaser/src/tweens/TweenManager.js');
const { PlayerProgress } = await import('../src/progression/PlayerProgress.ts');
const { defaultPlayerSave, SAVE_KEY, WELCOME_EVENT } = await import('../src/progression/PlayerSave.ts');
const { itemDefinitions } = await import('../src/config/equipment.ts');
const { opponentNames } = await import('../src/progression/profile.ts');
const { avatars, avatarSymbol } = await import('../src/progression/profile.ts');
const { rankTitle, rankProgress, rankDisplay } = await import('../src/progression/rank.ts');
const { LeIntroView } = await import('../src/ui/LeIntroView.ts');
const { buildPath, pointOnPath } = await import('../src/combat/path.ts');

test('匹配时间使用独立可注入表现随机，范围为2000～3000ms',()=>{
 assert.equal(matchingDuration(()=>0),2000);
 assert.equal(matchingDuration(()=>0.5),2500);
 assert.ok(matchingDuration(()=>0.999999)<3000);
 assert.equal(flowConfig.vsEnterMs,400);assert.equal(flowConfig.vsHoldMs,1400);assert.equal(flowConfig.vsExitMs,500);
});

test('对手资料安全池、头像和装备快照确定生成，不消费gameplay RNG',()=>{
 const random=Math.random;let calls=0,created=0;
 const inventory=createInventory();inventory.find(i=>i.id==='farmer').equipped=true;
 const loadout=createLoadout(inventory),top=createLoadout([]);
 try{
  Math.random=()=>{throw new Error('表现不应调用gameplay RNG');};
  const setup=createBattleSetup(loadout,()=>{calls++;return 0.5;},()=>{created++;return top;});
  assert.equal(calls,6);assert.equal(created,1);
  assert.equal(setup.opponentProfile.nickname,opponentNames[28]);
  assert.equal(setup.opponentProfile.avatarId,'duck');
  assert.equal(setup.opponentLoadout,top);assert.deepEqual(setup.playerLoadout,loadout);
  assert.notEqual(setup.playerLoadout,loadout);assert.ok(Object.isFrozen(setup.playerLoadout));
  assert.ok(Object.isFrozen(setup.opponentProfile));
 }finally{Math.random=random;}
});

test('每个新的匹配创建独立profile及match-local id，允许昵称重复',()=>{
 const factory=()=>createLoadout([]);
 const a=createBattleSetup(undefined,()=>0,factory),b=createBattleSetup(undefined,()=>0,factory);
 assert.notEqual(a.opponentProfile,b.opponentProfile);
 assert.notEqual(a.opponentProfile.id,b.opponentProfile.id);
 assert.equal(a.opponentProfile.nickname,b.opponentProfile.nickname);
});

// 使用真实场景、控制器和 Phaser Clock；仅替代渲染对象及场景调度。
function pve(startImmediately = true, startingMoney = gameConfig.initialMoney, autoFlow = true, matchingOptions = {}) {
  // 旧玩法测试显式拥有测试装备并已看过欢迎演出，不再依赖真实玩家默认ownership。
  const seed={...defaultPlayerSave(),ownedItemIds:itemDefinitions.map(d=>d.id),equippedPassiveItemIds:[],seenOneTimeEventIds:[WELCOME_EVENT]};
  let saved=JSON.stringify(seed);
  const progress=matchingOptions.playerProgress ?? new PlayerProgress({getItem:()=>saved,setItem:(_k,v)=>{saved=v;}});
  const game = new GameScene();
  const ready = new ReadyScene();
  ready.nicknameInputFactory = matchingOptions.nicknameInputFactory ?? ((_scene,value)=>({value:()=>value,destroy(){}}));
  const matching = new MatchingScene();
  let matchingActive = false;
  let gameActive = false;
  const sceneOrder = [];
  const queued = [];
  const setupHistory = [];
  const items = new ItemsScene();
  const howToPlay = new HowToPlayScene();
  let itemsActive = false;
  let howToPlayActive = false;
  const overlay = new PveOverlayScene();
  for(const scene of [game,ready,items,howToPlay])scene.playerProgress=progress;
  const result = new ResultScene(), shop = new ShopScene();shop.playerProgress=progress;
  let resultActive=false,shopActive=false;
  let active = true;
  let overlayActive = false;
  let readyActive = true;
  let startCount = 0;
  let now = 0;
  const objects = new Map();
  const globalEvents = new EventEmitter();
  const createGame = data => {
    const originalMoney = gameConfig.initialMoney;
    gameConfig.initialMoney = startingMoney;
    try { game.create(data); } finally { gameConfig.initialMoney = originalMoney; }
  };
  function prepare(scene) {
    const list = [];
    objects.set(scene, list);
    const object = (kind, x = 0, y = 0, width = 0, height = 0, color = null) => {
      const target = Object.assign(new EventEmitter(), { kind, x, y, width, height, color, text: '', visible: true, draws: [] });
      let proxy;
      proxy = new Proxy(target, { get(t, key) {
        if (key in t) return t[key];
        if (key === 'setText') return value => { t.text = value; return proxy; };
        if (key === 'setSize') return (width,height)=>{t.width=width;t.height=height;return proxy;};
        if (key === 'setPosition') return (x,y) => {t.x=x;t.y=y;return proxy;};
        if (key === 'setAlpha') return value => {t.alpha=value;return proxy;};
        if (key === 'setStrokeStyle') return (...args) => {t.stroke=args;return proxy;};
        if (key === 'alpha') return t.alpha;
        if (key === 'setScale') return (scale) => {t.scale=scale;return proxy;};
        if (key === 'setVisible') return value => { t.visible = value; return proxy; };
        if (key === 'disableInteractive') return () => {t.interactive=false;return proxy;};
        if (key === 'setInteractive') return () => { t.interactive = true; return proxy; };
        if (key === 'setWordWrapWidth') return (width, advanced) => { t.wrapWidth=width;t.advancedWrap=advanced;return proxy; };
        if (key === 'setFixedSize') return (width,height) => { t.fixedWidth=width;t.fixedHeight=height;return proxy; };
        if (key === 'getBounds') return () => ({x:t.x-t.width/2,y:t.y-t.height/2,width:t.width,height:t.height,
          contains: (px, py) => Math.abs(px-t.x) <= t.width/2 && Math.abs(py-t.y) <= t.height/2 });
        if (key === 'clear') return () => { t.draws = []; return proxy; };
        if (key === 'destroy') return () => { t.children?.forEach(child=>child.destroy());t.removeAllListeners(); t.text = ''; t.visible = false; t.interactive = false; t.draws = []; return proxy; };
        if (key === 'lineStyle' || key === 'moveTo' || key === 'lineTo' || key === 'strokePath' || key === 'fillCircle' || key === 'fillRect' || key === 'fillRoundedRect' || key === 'strokeRect' || key === 'lineBetween') return (...args) => { t.draws.push([key, ...args]); return proxy; };
        return () => proxy;
      } });
      list.push(proxy);
      return proxy;
    };
    scene.events ??= new EventEmitter();
    scene.input ??= new EventEmitter();
    scene.game = { events: globalEvents };
    scene.scale = { width: 750 };
    scene.add = Object.fromEntries(['rectangle', 'circle', 'ellipse', 'triangle', 'graphics', 'container'].map(kind => [kind, (...args) => object(kind, ...args)]));
    scene.add.circle=(x,y,radius,color)=>object('circle',x,y,radius,radius,color);
    scene.add.container = (x,y,children=[])=>{const parent=object('container',x,y);parent.children=children;return parent;};
    scene.add.text = (x, y, text, style) => { const textObject=object('text', x, y).setText(text);textObject.style=style;return textObject; };
    scene.sys = { events: new EventEmitter() };
    scene.time = new Clock(scene);
    scene.tweens = new TweenManager(scene);
    scene.tweens.getDelta = ()=>10;
  }
  function shutdown(scene) {
    scene.events.emit('shutdown');
    scene.time.shutdown();
    scene.tweens.shutdown();
    for (const item of objects.get(scene)) item.removeAllListeners();
  }
  game.scene = {
    pause: () => { active = false; },
    stop: key=>{if(key==='MatchingScene'&&matchingActive){shutdown(matching);matchingActive=false;}},
    launch: (_key, data) => { prepare(overlay); overlayActive = true; overlay.create(data); },
  };
  ready.scene = {
    start: (key, data) => {
      if (key === 'ShopScene') {shutdown(ready);readyActive=false;shopActive=true;prepare(shop);shop.create();return;}
      if (key === 'ItemsScene') {
        shutdown(ready);readyActive=false;itemsActive=true;prepare(items);items.create(data);return;
      }
      if (key === 'HowToPlayScene') {
        shutdown(ready);readyActive=false;howToPlayActive=true;prepare(howToPlay);howToPlay.create();return;
      }
      assert.fail('HOME starts only ItemsScene directly');
    },
  };
  ready.scene.launch=(key,data)=>{assert.equal(key,'MatchingScene');startMatching(data);};
  items.scene = { start: (key,data) => {
    assert.equal(key,'ReadyScene');shutdown(items);itemsActive=false;readyActive=true;prepare(ready);ready.create(data);
  } };
  howToPlay.scene={start:key=>{
    assert.equal(key,'ReadyScene');shutdown(howToPlay);howToPlayActive=false;readyActive=true;prepare(ready);ready.create();
  }};
  overlay.scene = {
    resume: () => { active = true; game.events.emit('resume'); },
    stop: key => { if (key === 'GameScene') {shutdown(game);gameActive=false;} else { shutdown(overlay); overlayActive = false; } },
    start: (key,data) => {shutdown(overlay);overlayActive=false;if(key==='ResultScene'){prepare(result);resultActive=true;result.create(data);return;}assert.equal(key,'ReadyScene');readyActive=true;active=true;prepare(ready);ready.create(data);},
  };
  result.scene={start:(key,data)=>{assert.equal(key,'ReadyScene');shutdown(result);resultActive=false;readyActive=true;active=true;prepare(ready);ready.create(data);}};
  shop.scene={start:(key,data)=>{assert.equal(key,'ReadyScene');shutdown(shop);shopActive=false;readyActive=true;prepare(ready);ready.create(data);}};
  function startMatching(data) {
    active=true;matchingActive=true;prepare(matching);
    matching.create({...data,presentationRandom:()=>0,...matchingOptions});
    setupHistory.push(matching.setup);
    if(autoFlow) finishFlow();
  }
  function finishFlow() {
    // Existing battle tests fast-forward presentation without spending match preparation time.
    while(matchingActive) tick(true);
  }
  matching.scene={
    launch:(key,data)=>{assert.equal(key,'GameScene');startCount++;sceneOrder.push('launchGame');
      prepare(game);active=true;gameActive=true;createGame(data);},
    bringToTop:()=>sceneOrder.push('matchingOnTop'),
    stop:key=>{queued.push(()=>{
      if(key==='ReadyScene'){if(readyActive)shutdown(ready);readyActive=false;}
      else if(matchingActive){shutdown(matching);matchingActive=false;}
    });},
  };
  function tick(flowOnly=false) {
    now+=10;
    const scenes=[...(readyActive?[ready]:[]),...(itemsActive?[items]:[]),
      ...(gameActive&&active&&!flowOnly?[game]:[]),...(matchingActive?[matching]:[]),...(overlayActive?[overlay]:[]),...(resultActive?[result]:[]),...(shopActive?[shop]:[])];
    for(const scene of scenes){
      scene.time.preUpdate();scene.time.update(now,10);scene.tweens.step();scene.events.emit('update',now,10);
    }
    while(queued.length)queued.shift()();
  }
  prepare(ready);
  ready.create();
  if (startImmediately) ready.requestStartGame();
  const text = (x, y, scene = game) => objects.get(scene).find(o => o.kind === 'text' && o.x === x && o.y === y)?.text;
  const click = (x, y) => {
    let scene=resultActive?result:overlayActive?overlay:shopActive?shop:howToPlayActive?howToPlay:itemsActive?items:gameActive?game:ready;
    const cover=matchingActive&&objects.get(matching).find(o=>o.kind==='container'&&o.interactive&&o.visible&&o.getBounds().contains(x,y));
    if(cover)scene=matching;
    const target = objects.get(scene).findLast(o => o.interactive === true && o.x === x && o.y === y);
    target?.emit('pointerdown', { id: 1, x, y, primaryDown: true }, 0, 0, { stopPropagation() {} });
  };
  const drag = (from, to) => {
    if (!active || !gameActive || overlayActive || itemsActive) return;
    if(matchingActive&&objects.get(matching).some(o=>o.kind==='container'&&o.interactive&&o.visible&&o.getBounds().contains(...from)))return;
    const p = { id: 1, primaryDown: true, x: from[0], y: from[1] };
    game.input.emit('pointerdown', p);
    game.input.emit('pointermove', { ...p, x: to[0], y: to[1] });
    game.input.emit('pointerup', { ...p, primaryDown: false, x: to[0], y: to[1] });
  };
  const run = ms => {
    for (let i = 0; i < ms; i += 10) {
      tick();
    }
  };
  const snapshot = () => JSON.stringify(objects.get(readyActive ? ready : game).map(o => ({ text: o.text, visible: o.visible, draws: o.draws })));
  return { progress, result, shop, get overlay(){return resultActive?result:overlay;}, game, ready, matching, setupHistory, finishFlow, shutdown, items, howToPlay, objects, text, click, drag, run, snapshot, sceneOrder, isActive: () => active && gameActive && !itemsActive,
    startCount: () => startCount, globalEvents };
}

// 使用真实漏怪进入指定结算，避免再依赖已退役的单边清场胜利条件。
function untilPhase(p,phase,limit=4000){
 let elapsed=0;while(p.matching.phase!==phase&&elapsed<limit){p.run(10);elapsed+=10;}
 assert.equal(p.matching.phase,phase);return elapsed;
}

test('HOME内匹配保持视觉和配置锁定，VS散开时才创建战斗且重复开始安全',()=>{
 const p=pve(false,20,false),homeObjects=p.objects.get(p.ready);
 assert.equal(p.game.match,null);p.click(375,p.result.resultSnapshot?1070:765);
 for(let i=0;i<10;i++)p.ready.requestStartGame();
 assert.equal(p.matching.phase,'MATCHING');assert.equal(p.startCount(),0);
 assert.equal(p.text(375,765,p.ready),'正在寻找对手…');
 assert.equal(p.objects.get(p.ready),homeObjects);assert.equal(p.text(375,440,p.ready),'乐 GAME');
 assert.equal(homeObjects.find(o=>o.kind==='rectangle'&&o.x===375&&o.y===765).interactive,false);
 assert.equal(homeObjects.find(o=>o.kind==='rectangle'&&o.x===375&&o.y===885).interactive,false);
 p.click(375,885);assert.equal(p.objects.has(p.items),false);
 const setup=p.matching.setup;
 p.run(1990);assert.equal(p.matching.phase,'MATCHING');assert.equal(p.game.match,null);
 p.run(10);assert.equal(p.matching.phase,'VS_ENTER');assert.equal(p.game.match,null);
 const panels=p.objects.get(p.matching).filter(o=>o.kind==='container');
 assert.equal(panels[0].y,-333.5);assert.equal(panels[1].y,1667.5);
 assert.equal(panels[0].children.find(o=>o.kind==='text'&&o.y===60).text,setup.opponentProfile.nickname);
 assert.equal(panels[1].children.find(o=>o.kind==='text'&&o.y===60).text,setup.playerProfile.nickname);
 const enter=untilPhase(p,'VS_HOLD');assert.ok(enter>=400&&enter<=430);
 assert.equal(panels[0].y,333.5);assert.equal(panels[1].y,1000.5);
 p.run(1390);assert.equal(p.game.match,null);
 p.run(10);assert.equal(p.matching.phase,'VS_EXIT');assert.equal(p.startCount(),1);
 assert.equal(p.game.battleSetup,setup);assert.equal(p.game.match.timeline.elapsedMs,0);
 assert.equal(p.game.presentationPhase,'INTRO');assert.equal(p.game.input.enabled,true);
 assert.equal(p.sceneOrder.at(-2),'launchGame');assert.equal(p.sceneOrder.at(-1),'matchingOnTop');
 assert.equal(p.game.sides.bottom.recruitment.money,20);
 assert.deepEqual(p.game.sides.bottom.recruitment.slots,Array(5).fill(null));
 p.run(200);assert.ok(p.game.match.timeline.elapsedMs>=180);
 assert.ok(panels[0].y<333.5);assert.ok(panels[1].y>1000.5);
 const exit=untilPhase(p,'FINISHED');assert.ok(exit>=300&&exit<=340);
 assert.equal(p.matching.setup,null);assert.ok(panels.every(o=>!o.visible&&!o.interactive));
 assert.equal(p.matching.tweens.tweens.length,0);assert.equal(p.matching.time._active.length,0);
});

test('MatchingScene只生成一次AI装备，GameScene消费原setup而不再次生成',()=>{
 let created=0;const top=createLoadout([]);
 const p=pve(false,20,false,{createOpponentLoadout:()=>{created++;return top;}});
 p.click(375,p.result.resultSnapshot?1070:765);const setup=p.matching.setup;
 assert.equal(created,1);
 p.run(2000);assert.equal(created,1);untilPhase(p,'VS_HOLD');
 const random=Math.random;
 try{Math.random=()=>{throw new Error('进入GameScene不可再次生成AI装备');};p.run(1400);}
 finally{Math.random=random;}
 assert.equal(created,1);assert.equal(p.game.battleSetup,setup);
 assert.deepEqual(p.game.sides.top.recruitment.loadout,top);
});

test('MATCHING shutdown清除timer且旧匹配回调无法启动VS或GameScene',()=>{
 const p=pve(false,20,false);p.click(375,p.result.resultSnapshot?1070:765);
 const callback=p.matching.time._pendingInsertion[0].callback;
 p.shutdown(p.matching);callback();
 assert.equal(p.matching.setup,null);assert.equal(p.startCount(),0);assert.equal(p.game.match,null);
 assert.equal(p.matching.time._active.length,0);assert.equal(p.matching.time._pendingInsertion.length,0);
});

test('VS shutdown后过期/重复回调不能创建旧局或重复启动新局',()=>{
 const p=pve(false,20,false);p.click(375,p.result.resultSnapshot?1070:765);p.run(2000);untilPhase(p,'VS_HOLD');
 const old=p.matching.time._pendingInsertion[0]?.callback ?? p.matching.time._active[0].callback;
 p.shutdown(p.matching);old();assert.equal(p.startCount(),0);
 p.matching.create({presentationRandom:()=>0});
 p.finishFlow();const match=p.game.match;
 old();old();assert.equal(p.startCount(),1);assert.equal(p.game.match,match);
});

test('玩家装备跨HOME/匹配/VS/战斗保留，道具往返不创建Match',()=>{
 const p=pve(false,20,false);p.click(375,885);p.click(155,920);p.click(375,835);p.click(375,1200);
 assert.equal(p.game.match,null);p.click(375,p.result.resultSnapshot?1070:765);
 const setup=p.matching.setup;assert.equal(setup.playerLoadout.passive[0].id,'farmer');
 p.finishFlow();assert.deepEqual(p.game.sides.bottom.recruitment.loadout,setup.playerLoadout);
});

test('连续三次result再匹配创建全新对手/Match/Side/Timeline并清理旧AI输入',()=>{
 const p=pve(true,20,false);p.finishFlow();
 for(let i=0;i<3;i++){
  const old=p.game.match,setup=p.game.battleSetup,clock=p.game.time;
  finishMatch(p,false);
  const oldResult=p.objects.get(p.overlay).find(o=>o.interactive&&o.x===375&&o.y===1070)
    .listeners('pointerdown')[0];
  p.click(375,p.result.resultSnapshot?1070:765);p.click(375,p.result.resultSnapshot?1070:765);
  assert.equal(old.status,'destroyed');assert.equal(p.game.match,null);
  assert.equal(p.startCount(),i+1);assert.equal(p.matching.phase,'MATCHING');
  assert.equal(p.game.events.listenerCount('update'),0);assert.equal(p.globalEvents.listenerCount('blur'),0);
  assert.equal(clock._active.length,0);assert.equal(clock._pendingInsertion.length,0);
  p.finishFlow();assert.equal(p.startCount(),i+2);
  const fresh=p.game.match;assert.notEqual(fresh,old);assert.notEqual(fresh.timeline,old.timeline);
  assert.notEqual(fresh.topSide,old.topSide);assert.notEqual(fresh.bottomSide,old.bottomSide);
  assert.notEqual(p.game.battleSetup.opponentProfile.id,setup.opponentProfile.id);
  assert.deepEqual(fresh.bottomSide.recruitment.loadout,setup.playerLoadout);
  old.update(10000);assert.equal(fresh.timeline.elapsedMs,0);
  oldResult({},0,0,{stopPropagation(){}});assert.equal(p.game.match,fresh);assert.equal(p.startCount(),i+2);
  assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.globalEvents.listenerCount('blur'),3);
 }
});

function finishMatch(p, win, survivorLeaks=0, showPanel=true) {
 const losing=win?'top':'bottom', surviving=win?'bottom':'top';
 for(const [id,count]of [[losing,3],[surviving,survivorLeaks]])for(let n=0;n<count;n++){
  const side=p.game.sides[id],enemy=side.combat.spawnEnemy();
  enemy.distance=side.combat.path.totalLength-.001;enemy.moveSpeed=55;
 }
 p.run(20);if(showPanel)p.run(400);
}

function beginReveal(p){
 p.click(375,p.result.resultSnapshot?1070:765);p.run(2000);untilPhase(p,'VS_HOLD');p.run(flowConfig.vsHoldMs);
 assert.equal(p.matching.phase,'VS_EXIT');assert.equal(p.game.match.timeline.elapsedMs,0);
}

const leTokens=p=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text==='乐'&&o.visible);
const closePoint=(actual,expected)=>{
 assert.ok(Math.abs(actual.x-expected.x)<0.001);
 assert.ok(Math.abs(actual.y-expected.y)<0.001);
};

test('揭幕只阻挡仍被面板覆盖的区域，露出后INTRO立即可来财和拖动',()=>{
 const p=pve(false,20,false);beginReveal(p);
 assert.equal(p.game.input.enabled,true);assert.equal(p.game.match.running,true);
 p.click(375,1158);assert.equal(p.game.sides.bottom.recruitment.successfulRecruits,0);
 p.run(400);assert.equal(p.matching.phase,'VS_EXIT');
 const random=Math.random;
 try{Math.random=()=>0;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);}
 finally{Math.random=random;}
 assert.equal(p.game.sides.bottom.recruitment.successfulRecruits,1);
 assert.equal(p.game.sides.bottom.board.tiles[0].unit.type,'刀');
 assert.equal(p.game.presentationPhase,'INTRO');assert.equal(p.game.sides.bottom.recruitment.money,10);
});

test('INTRO期间AI按原规则运行，不等待乐7秒到位',()=>{
 const p=pve();p.run(2000);
 assert.ok(p.game.sides.top.recruitment.successfulRecruits>0);
 assert.equal(p.game.presentationPhase,'INTRO');assert.equal(p.game.sides.top.combat.enemies.length,0);
});

test('双方乐从各自入口同时出发，文本正向且没有重复终点乐',()=>{
 const p=pve(),tokens=leTokens(p);assert.equal(tokens.length,2);
 for(const [index,side]of ['bottom','top'].entries()){
  closePoint(tokens[index],boardProjection(testMap,750,side).point(testMap.path[0]));
  assert.equal(tokens[index].scale,1.125);assert.equal(tokens[index].style.fontSize,'32px');
 }
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='circle'&&o.color===0x697e67&&o.width===30).length,2);
 assert.equal(p.game.sides.bottom.combat.enemies.length,0);assert.equal(p.game.sides.top.combat.enemies.length,0);
});

test('乐3500ms沿完整路径半程，7000ms归位后使用原对象且无视觉跳变',()=>{
 const p=pve(),tokens=leTokens(p),path=buildPath(testMap.path);
 p.run(3500);
 const mid=pointOnPath(path,path.totalLength/2);
 for(const [index,side]of ['bottom','top'].entries())closePoint(tokens[index],boardProjection(testMap,750,side).point(mid));
 p.run(3500);
 for(const [index,side]of ['bottom','top'].entries())closePoint(tokens[index],boardProjection(testMap,750,side).point(testMap.path.at(-1)));
 const positions=tokens.map(o=>({x:o.x,y:o.y}));p.run(1000);
 assert.deepEqual(leTokens(p),tokens);assert.deepEqual(tokens.map(o=>({x:o.x,y:o.y})),positions);
 assert.equal(p.game.presentationPhase,'INTRO');
});

test('暂停冻结Match、AI和乐进度，恢复后从原位置继续',()=>{
 const p=pve();p.run(2500);p.click(75,55);
 const elapsed=p.game.match.timeline.elapsedMs,positions=leTokens(p).map(o=>({x:o.x,y:o.y}));
 const top=JSON.stringify(p.game.sides.top.recruitment);
 p.run(5000);assert.equal(p.game.match.timeline.elapsedMs,elapsed);
 assert.deepEqual(leTokens(p).map(o=>({x:o.x,y:o.y})),positions);
 assert.equal(JSON.stringify(p.game.sides.top.recruitment),top);
 p.click(375,p.result.resultSnapshot?1070:765);p.run(1000);assert.ok(p.game.match.timeline.elapsedMs>elapsed);
 assert.notDeepEqual(leTokens(p).map(o=>({x:o.x,y:o.y})),positions);
});

test('乐为纯表现，不成为索敌/漏怪/击杀/EXP对象，9500ms仍从Match零点出兵',()=>{
 const p=pve(),side=p.game.sides.bottom;
 side.recruitment.slots[0]={kind:'heroLetter',type:'小',level:1};
 side.recruitment.slots[1]={kind:'heroLetter',type:'美',level:1};
 side.drop({kind:'slot',index:0},{kind:'tile',index:0});side.drop({kind:'slot',index:1},{kind:'tile',index:1});
 p.run(7000);assert.equal(side.combat.enemies.length,0);assert.equal(side.combat.projectiles.length,0);
 assert.equal(side.heroes.links.size,1);assert.equal([...side.heroes.links.values()][0].currentExp,0);
 assert.equal(side.recruitment.money,20);assert.deepEqual(p.game.match.health,{bottom:3,top:3});
 assert.equal(side.combat.nextEnemyId,1);assert.equal(p.game.presentationPhase,'INTRO');
 p.run(2490);assert.equal(side.combat.enemies.length,0);assert.equal(p.game.presentationPhase,'INTRO');
 p.run(10);assert.equal(side.combat.nextEnemyId,2);assert.equal(p.game.presentationPhase,'RUNNING');
 assert.ok(Math.abs(p.game.match.timeline.elapsedMs-9500)<0.001);
});

test('LeIntroView只读取给定进度，不注册timer/tween，destroy清除表现对象',()=>{
 const p=pve(false),count=p.objects.get(p.ready).length;
 const view=new LeIntroView(p.ready,testMap);view.update(3500);
 assert.equal(p.ready.time._pendingInsertion.length,0);assert.equal(p.ready.tweens.tweens.length,0);
 const objects=p.objects.get(p.ready).slice(count);assert.equal(objects.length,4);
 view.destroy();assert.ok(objects.every(o=>!o.visible));assert.equal(p.game.match,null);
});

test('VS滑入中shutdown停止tween，旧完成回调不能进入停留或创建Match',()=>{
 const p=pve(false,20,false);p.click(375,p.result.resultSnapshot?1070:765);p.run(2000);
 const callback=p.matching.tweens.tweens.at(-1).callbacks.onComplete.func;
 const objects=p.objects.get(p.matching);p.shutdown(p.matching);callback();
 assert.equal(p.game.match,null);assert.equal(p.startCount(),0);
 assert.equal(p.matching.tweens.tweens.length,0);assert.equal(p.matching.time._pendingInsertion.length,0);
 assert.ok(objects.every(o=>!o.visible));
});

test('揭幕期间退出旧战斗同时清理VS，旧回调和旧乐不能影响后续新局',()=>{
 const p=pve(false,20,false);beginReveal(p);p.run(200);
 const callback=p.matching.tweens.tweens.at(-1).callbacks.onComplete.func;
 const tokens=leTokens(p),match=p.game.match;
 p.shutdown(p.game);callback();
 assert.equal(match.status,'destroyed');assert.equal(p.game.match,null);
 assert.ok(tokens.every(o=>!o.visible));assert.equal(p.matching.tweens.tweens.length,0);
 p.ready.create();p.ready.requestStartGame();p.finishFlow();
 const fresh=p.game.match;callback();assert.equal(p.game.match,fresh);assert.equal(p.startCount(),2);
 assert.equal(leTokens(p).length,2);assert.equal(fresh.timeline.elapsedMs,0);
});

// 渲染测试自己明确布置所需阵容；正式GameScene不再预置单位。
function topRenderFixture(p) {
 p.game.match.bindController('top',{update(){},stop(){},destroy(){}});
 setupDevTopSide(p.game.sides.top);
 p.run(10);
 return p;
}

test('背包详情、装卸返回、单局被动栏及连续重开保留loadout',()=>{
  const p=pve(false);assert.equal(p.text(375,885,p.ready),'道具');p.click(375,885);
  p.run(30000);assert.equal(p.objects.has(p.game),false);assert.equal(p.text(155,910,p.items),'农民');
  p.click(155,920);assert.equal(p.text(375,480,p.items),'农民');assert.equal(p.text(375,540,p.items),'类型：被动道具');
  assert.equal(p.text(375,635,p.items),'携带后，征兵时有概率出现农民。部署后的农民不会攻击，会周期性生产美金。');
  const description=p.objects.get(p.items).find(o=>o.kind==='text'&&o.y===635);
  assert.equal(description.advancedWrap,true);assert.equal(description.wrapWidth,490);
  assert.equal(description.fixedWidth,500);assert.ok(description.fixedWidth<590);
  const shade=p.objects.get(p.items).findLast(o=>o.kind==='rectangle'&&o.width===750);
  shade.emit('pointerdown');assert.equal(p.objects.get(p.items).some(o=>o.text==='装备'&&o.visible),false);
  p.click(155,920);p.click(375,835);assert.equal(p.text(125,410,p.items),'农民');
  p.click(155,920);assert.ok(p.objects.get(p.items).some(o=>o.text==='卸下'&&o.visible));p.click(375,835);
  assert.equal(p.text(125,410,p.items),'—');p.click(155,920);p.click(375,835);
  p.click(375,1200);assert.equal(p.ready.startState,'READY');p.click(375,885);
  assert.equal(p.text(125,410,p.items),'农民');p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);
  p.click(75, 55);p.run(10000);assert.equal(p.text(120,1110),'农民');p.click(375,p.result.resultSnapshot?1070:765);
  for(let round=0;round<3;round++){
    assert.equal(p.text(120,1110),'农民');assert.equal(p.text(630,1262),'—');
    for(const x of [80,670])assert.notEqual(p.objects.get(p.game).find(o=>o.kind==='rectangle'&&o.x===x&&o.y===1018).interactive,true);
    p.run(1000);assert.equal(p.text(170, 55),'$ 20');
    finishMatch(p,false);assert.equal(p.text(375,180,p.overlay),'失败');p.click(375,p.result.resultSnapshot?1070:765);
    assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.text(625, 55),'第 1 波');
  }
  finishMatch(p,true);assert.equal(p.text(375,180,p.overlay),'胜利');
  p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.text(120,1110),'农民');
});

test('未装备农民开局被动栏为空',()=>{
  const p=pve();assert.equal(p.text(120,1110),'—');assert.equal(p.objects.get(p.game).some(o=>o.text==='农民'),false);
});

test('初始READY无对局控制器和计时器，长时间等待无敌人/资源/技能/EXP/操作', () => {
  const p = pve(false);
  assert.equal(p.ready.startState, 'READY');
  assert.equal(p.isActive(), false);
  assert.equal(p.text(375,440,p.ready), '乐 GAME');
  assert.equal(p.text(375,765,p.ready), '开始对战');
  assert.equal(p.text(730,1314,p.ready), 'v' + GAME_VERSION);
  const before = p.snapshot();
  p.run(120000);
  p.click(375,1158);p.click(75, 55);p.drag([183,1018],[164.0625,574.0625]);
  assert.equal(p.snapshot(), before);
  assert.equal(p.objects.has(p.game), false);
  assert.equal(p.ready.events.listenerCount('update'), 0);
  assert.equal(p.ready.input.listenerCount('pointerdown'), 0);
  assert.equal(p.ready.time._active.length, 0);
  assert.equal(p.ready.time._pendingInsertion.length, 0);
  assert.equal(p.startCount(), 0);
});

test('开始后统一初始化一次，重复请求无效，无条件收入保持关闭且波次正常启动', () => {
  const p = pve(false);
  p.run(60000);
  p.click(375,p.result.resultSnapshot?1070:765);
  for (let i=0;i<10;i++) p.ready.requestStartGame();
  assert.equal(p.ready.startState, 'MATCHING');
  assert.equal(p.isActive(), true);
  assert.equal(p.startCount(), 1);
  assert.equal(p.text(170, 55), '$ 20');
  assert.equal(p.text(625, 55), '第 1 波');
  assert.equal(p.game.events.listenerCount('update'),1);
  p.run(990);assert.equal(p.text(170, 55), '$ 20');
  p.run(10);assert.equal(p.text(170, 55), '$ 20');
  assert.equal(p.game.time._active.length, 0);
  const enemyCircles = () => p.objects.get(p.game).filter(o=>o.kind==='graphics'&&o.scale>0)
    .flatMap(o=>o.draws).filter(d=>d[0]==='fillCircle'&&d[3]===combatConfig.visuals.enemyRadius);
  p.run(pressureConfig.firstEnemyDelay-1010);assert.equal(enemyCircles().length, 0);
  p.run(20);assert.equal(enemyCircles().length, 1);
  const random = Math.random;
  try { Math.random=()=>0;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]); }
  finally { Math.random=random; }
  assert.equal(p.text(170, 55), '$ 10');
  assert.equal(p.text(164.0625,577.0625), '');
  p.click(75, 55);assert.equal(p.text(375,565,p.overlay),'已暂停');
  p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.isActive(),true);
});

test('双格视觉、休眠标识、拆开恢复、暂停、胜负及多次重开清理', () => {
  const random = Math.random;
  const xiaomei = heroRegistry.find(hero => hero.id === 'xiaomei');
  const damage = xiaomei.attackDamageByLevel[0];
  const skillDamage = skillConfigs.xiaomei_barrage.damage;
  try {
    const p = pve(true, 100);
    for (const win of [false, true, false]) {
      xiaomei.attackDamageByLevel[0] = win ? damage : 1;
      skillConfigs.xiaomei_barrage.damage = win ? skillDamage : 1;
      Math.random = () => recruitRoll(p,'小');
      p.click(375, 1158);
      p.drag([183,1018], [164.0625,574.0625]);
      assert.equal(p.text(164.0625,555.6875), 'Zz');
      assert.equal(p.objects.get(p.game).filter(o => o.text === 'Zz' && o.y > 532).length, 1);
      Math.random = () => recruitRoll(p,'美');
      p.click(375, 1158);
      p.drag([183,1018], [248.4375,574.0625]);
      assert.equal(p.text(164.0625,555.6875), '');
      assert.equal(p.text(248.4375,555.6875), '');
      assert.equal(p.objects.get(p.game).some(o => o.text === '小美'), false);
      const boxes = p.objects.get(p.game).filter(o => o.kind === 'rectangle' && o.y === 577.0625 && [164.0625,248.4375].includes(o.x));
      assert.equal(boxes.length,4);
      assert.ok(boxes.slice(-2).every(o => !o.visible));
      const linkedBorder = () => p.objects.get(p.game).some(o => o.kind === 'graphics' && o.scale > 0
        && o.draws.some(d => d[0] === 'strokeRect' && d[3] === 150 && d[4] === 75));
      assert.equal(linkedBorder(), true);
      const pointer = { id: 1, x: 248.4375, y: 574.0625, primaryDown: true };
      p.game.input.emit('pointerdown', pointer);
      p.run(10);
      const range = p.objects.get(p.game).filter(o => o.kind === 'graphics' && o.scale > 0).at(-2);
      assert.ok(range.draws.some(d => d[0] === 'fillCircle' && d[1] === 225));
      p.game.input.emit('pointermove', { ...pointer, x: 290 });
      assert.equal(linkedBorder(), false);
      assert.equal(p.text(164.0625,555.6875), 'Zz');
      assert.equal(range.draws.length, 0);
      p.game.input.emit('pointerup', { ...pointer, x: 0, y: 0, primaryDown: false });
      assert.equal(linkedBorder(), true);
      // 收回字、反序交换、再放回都立即刷新边框及休眠状态。
      p.drag([248.4375,574.0625],[183,1018]);
      assert.equal(linkedBorder(),false);
      p.drag([183,1018],[248.4375,574.0625]);
      p.drag([164.0625,574.0625],[248.4375,574.0625]);
      assert.equal(linkedBorder(),false);
      p.drag([164.0625,574.0625],[248.4375,574.0625]);
      assert.equal(linkedBorder(),true);
      p.run(2100);
      p.click(75, 55);
      const paused=p.snapshot();
      p.run(5000);p.drag([248.4375,574.0625],[183,1018]);
      assert.equal(p.snapshot(),paused);
      p.click(375,p.result.resultSnapshot?1070:765);finishMatch(p,win);
      assert.equal(p.text(375,180,p.overlay),win?'胜利':'失败');
      const ended=p.snapshot();p.run(5000);p.drag([248.4375,574.0625],[183,1018]);
      assert.equal(p.snapshot(),ended);
      p.click(375,p.result.resultSnapshot?1070:765);
      assert.equal(linkedBorder(),false);
      assert.equal(p.objects.get(p.game).some(o => o.y > 532 && ['小','美','Zz'].includes(o.text)),false);
      assert.equal(p.game.events.listenerCount('update'),1);
      p.run(2000);
      assert.equal(p.objects.get(p.game).some(o=>o.kind==='graphics'&&o.scale>0&&o.draws.some(d=>d[0]==='lineBetween')),false);
      // 恢复下一轮初始计时，确保新一局重复测试也完全走关闭/创建流程。
      p.run(30000);p.click(375,p.result.resultSnapshot?1070:765);
    }
  } finally { Math.random=random;xiaomei.attackDamageByLevel[0]=damage;skillConfigs.xiaomei_barrage.damage=skillDamage; }
});

test('EXP条随参战击杀更新，暂停冻结，同字升级清零，拆开/重开清理', () => {
  const random = Math.random, enemyHp = combatConfig.enemy.maxHp;
  try {
    combatConfig.enemy.maxHp = 30;
    const p = pve(true, 100);
    Math.random = () => recruitRoll(p,'小');p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
    Math.random = () => recruitRoll(p,'美');p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
    const expEnemy=p.game.sides.bottom.combat.spawnEnemy();expEnemy.moveSpeed=0;
    p.run(4500);assert.equal([...p.game.sides.bottom.heroes.links.values()][0].currentExp,heroGrowth.rewards.kill);
    assert.equal(p.text(206.25,593.9375),'Lv.1');
    const expBars = () => p.objects.get(p.game).filter(o=>o.kind==='graphics'&&o.scale>0)
      .flatMap(o=>o.draws).filter(d=>d[0]==='fillRect'&&d[1]===156&&d[2]===635&&d[4]===3);
    assert.ok(expBars().some(d=>d[3]>0));
    p.click(75, 55);const paused=p.snapshot();p.run(10000);p.drag([279,1018],[248.4375,574.0625]);
    assert.equal(p.snapshot(),paused);p.click(375,p.result.resultSnapshot?1070:765);
    Math.random = () => recruitRoll(p,'小');p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);p.run(10);
    assert.equal(p.text(206.25,593.9375),'Lv.2');assert.ok(expBars().some(d=>d[3]===0));
    p.drag([248.4375,574.0625],[183,1018]);p.run(10);
    assert.equal(expBars().length,0);assert.equal(p.text(164.0625,555.6875),'Zz');
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.2'));
    p.run(30000);const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,p.result.resultSnapshot?1070:765);assert.equal(expBars().length,0);
    assert.equal(p.objects.get(p.game).some(o=>o.text==='Lv.2'&&o.y>532),false);
    Math.random=()=>recruitRoll(p,'小');p.click(375,1158);assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
  } finally { Math.random=random; combatConfig.enemy.maxHp = enemyHp; }
});

test('小美名字闪烁由技能发动触发，暂停冻结CD和释放中伤害，重开清理闪烁', () => {
  const random=Math.random,speed=combatConfig.enemy.moveSpeed,hp=combatConfig.enemy.maxHp;
  try {
    combatConfig.enemy.moveSpeed=25;combatConfig.enemy.maxHp=100000;
    const p=pve(true, 100);
    Math.random=()=>recruitRoll(p,'小');p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
    Math.random=()=>recruitRoll(p,'美');p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
    // Skill presentation fixture supplies durable in-range targets, independent of spawn cadence.
    for(let i=0;i<5;i++)p.game.sides.bottom.combat.spawnEnemy().moveSpeed=0;
    const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text==='小美'&&o.visible&&o.y>532);
    p.run(9500);assert.equal(flashes().length,0);
    p.click(75, 55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);
    p.click(375,p.result.resultSnapshot?1070:765);
    let seen=false;
    for(let ms=0;ms<6000&&!seen;ms+=10){p.run(10);seen=flashes().length>0;}
    assert.equal(seen,true);
    p.click(75, 55);const casting=p.snapshot();p.run(5000);assert.equal(p.snapshot(),casting);
    p.click(375,p.result.resultSnapshot?1070:765);p.run(500);assert.equal(flashes().length,0);
    combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp;
    p.drag([248.4375,574.0625],[183,1018]);finishMatch(p,false);
    assert.equal(p.text(375,180,p.overlay),'失败');const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,p.result.resultSnapshot?1070:765);assert.equal(flashes().length,0);p.run(10000);assert.equal(flashes().length,0);
  } finally { Math.random=random;combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp; }
});

for (const [name,left,right,cd] of [['阿饼','阿','饼',12000],['小六','小','六',12000]]) {
  test(`${name}技能事件闪烁、充能及发动后暂停冻结、拆开结算和重开清理`, () => {
    const random=Math.random,speed=combatConfig.enemy.moveSpeed,hp=combatConfig.enemy.maxHp;
    try {
      combatConfig.enemy.moveSpeed=25;combatConfig.enemy.maxHp=100000;
      const p=pve(true, 100);
      Math.random=()=>recruitRoll(p,left);p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
      Math.random=()=>recruitRoll(p,right);p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
      for(let i=0;i<5;i++)p.game.sides.bottom.combat.spawnEnemy().moveSpeed=0;
      const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text===name&&o.visible&&o.y>532);
      // 观察真实成长后的首次发动，不假定击杀升级前后的CD完全相同。
      p.run(1000);p.click(75, 55);const paused=p.snapshot();
      p.run(30000);p.drag([248.4375,574.0625],[183,1018]);assert.equal(p.snapshot(),paused);
      p.click(375,p.result.resultSnapshot?1070:765);
      let seen=false;
      for(let ms=0;ms<cd+1500&&!seen;ms+=10){p.run(10);seen=flashes().length>0;}
      assert.equal(seen,true);
      p.click(75, 55);const casting=p.snapshot();p.run(20000);assert.equal(p.snapshot(),casting);
      combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp;
      p.click(375,p.result.resultSnapshot?1070:765);p.drag([248.4375,574.0625],[183,1018]);p.run(10);assert.equal(flashes().length,0);
      finishMatch(p,false);assert.equal(p.text(375,180,p.overlay),'失败');
      const ended=p.snapshot();p.run(20000);assert.equal(p.snapshot(),ended);
      p.click(375,p.result.resultSnapshot?1070:765);p.run(1000);assert.equal(flashes().length,0);
      assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.game.time._active.length,0);
      assert.equal(p.objects.get(p.game).some(o=>o.y>532&&(o.text===name||o.text==='Zz')),false);
    } finally { Math.random=random;combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp; }
  });
}

test('PVE暂停冻结敌人、攻击、出兵与真实收入计时器；禁止操作并原位恢复', () => {
  const p = pve();
  const random = Math.random;
  try {
    Math.random = () => recruitRoll(p,'弓'); // 固定征到弓，保证暂停前已有自动攻击。
    p.click(375, 1158);
  } finally { Math.random = random; }
  p.drag([183,1018], [164.0625,574.0625]);
  p.run(2500);
  const elapsed = p.game.match.timeline.elapsedMs;
  p.click(75, 55);
  assert.equal(p.text(375, 565, p.overlay), '已暂停');
  assert.equal(p.game.input.enabled, false);
  const paused = p.snapshot();
  p.run(30000);
  p.click(375, 1158);
  p.drag([164.0625,574.0625], [248.4375,574.0625]);
  assert.equal(p.snapshot(), paused);
  assert.equal(p.game.match.timeline.elapsedMs, elapsed);
  p.click(375,p.result.resultSnapshot?1070:765);
  assert.equal(p.isActive(), true);
  assert.equal(p.game.input.enabled, true);
  assert.equal(p.snapshot(), paused);
  p.run(490);
  assert.ok(p.game.match.timeline.elapsedMs>elapsed+470&&p.game.match.timeline.elapsedMs<=elapsed+490);
  const money = p.text(170, 55);
  p.run(10);
  assert.equal(p.text(170, 55), money);
  for (let i = 0; i < 3; i++) {
    p.click(75, 55);
    p.run(5000);
    p.click(375,p.result.resultSnapshot?1070:765);
    assert.equal(p.game.time._active.length, 0);
    assert.equal(p.game.events.listenerCount('update'),1);
  }
});

test('胜负结算冻结游戏；连续重开清除单位、解锁、敌人、计时器和监听', () => {
  const random = Math.random;
  try {
    const p = pve(true, 100);
    for (let round = 0; round < 4; round++) {
      assert.equal(p.text(170, 55), '$ 100');
      assert.equal(p.text(625, 55), '第 1 波');
      assert.equal(p.text(670.3125,941.5625), '♥♥♥');
      assert.equal(p.text(730, 1314), 'v' + GAME_VERSION);
      assert.equal(p.text(501.5625,661.4375), '锁');
      assert.equal(p.objects.get(p.game).filter(o => o.kind === 'text' && o.y > 532 && o.text.startsWith('Lv.')).length, 0);
      assert.equal(p.game.events.listenerCount('update'),1);
      assert.equal(p.globalEvents.listenerCount('blur'), 3);
      assert.equal(p.game.input.listenerCount('pointerdown'), 2);
      p.run(10);
      assert.equal(p.game.time._active.length, 0);
      const win = round % 2 === 0;
      Math.random = () => recruitRoll(p,'铲');
      p.click(375, 1158);
      p.drag([183,1018], [501.5625,661.4375]);
      assert.equal(p.text(501.5625,661.4375), '+');
      Math.random = () => 0;
      p.click(375, 1158);
      p.drag([183,1018], [501.5625,661.4375]);
      p.run(2500);finishMatch(p,win,win?1:0);
      assert.equal(p.isActive(), false);
      assert.equal(p.text(375,180,p.overlay), win ? '胜利' : '失败');
      if (win) assert.equal(p.text(375,620,p.overlay), '乐：♥♥');
      assert.equal(p.text(375,1070,p.overlay), '再来一局');
      const ended = p.snapshot();
      p.run(10000);
      p.click(375, 1158);
      assert.equal(p.snapshot(), ended);
      const oldClock = p.game.time;
      p.click(375,p.result.resultSnapshot?1070:765);
      assert.equal(p.isActive(), true);
      assert.equal(p.startCount(), round + 2); // 每次重新匹配后才创建新战斗。
      assert.equal(oldClock._active.length, 0);
      assert.equal(oldClock._pendingInsertion.length, 0);
    assert.ok(p.objects.get(p.game).filter(o => o.kind === 'graphics' && o.draws.some(d=>d[0]==='fillRoundedRect'))
      .every(o => o.draws.every(d=>d[0]==='fillRoundedRect')));
    }
  } finally { Math.random = random; }
});

test('上方入口右下、终点左上，路径和格子统一计算且不改变基础地图', () => {
  const before = structuredClone(testMap);
  const upper = getBattlefieldLayout(testMap, 750, true);
  assert.deepEqual(upper.path[0], { x: 637.5, y: 527.5 });
  assert.deepEqual(upper.path.at(-1), { x: 112.5, y: 227.5 });
  for (const key of ['path', 'cells']) {
    upper[key].forEach((point, index) => {
      const base = testMap[key][index];
      assert.equal(point.x, 750 - base.x);
      assert.equal(point.y, 2 * testMap.mirrorY - base.y);
      if (key === 'cells') assert.equal(point.unlocked, base.unlocked);
    });
  }
  assert.deepEqual(testMap, before);
  const lower = getBattlefieldLayout(testMap, 750, false);
  assert.deepEqual(lower.path, testMap.path);
  assert.deepEqual(lower.cells, testMap.cells);
});

test('不同地图及分界线沿用同一变换，无第二套上半坐标', () => {
  const map = { ...testMap, mirrorY: 400,
    path: [{ x: 30, y: 450 }, { x: 320, y: 700 }],
    cells: [{ x: 60, y: 490, unlocked: false }] };
  assert.deepEqual(getBattlefieldLayout(map, 400, true), {
    path: [{ x: 370, y: 350 }, { x: 80, y: 100 }],
    cells: [{ x: 340, y: 310, unlocked: false }],
  });
});

const { PlayerSide } = await import('../src/systems/PlayerSide.ts');

function setup(unit = { type: '刀', level: 1 }) {
  const graphics = [];
  const texts = [];
  const scene = {
    events: new EventEmitter(), input: new EventEmitter(), game: { events: new EventEmitter() },
    scale: { width: 750, height: 1334 },
    add: { graphics() {
      const graphic = {
        x:0,y:0,setPosition(){return this;},setScale(){return this;},
        circle: false,
        clear() { this.circle = false; return this; },
        setDepth() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
        fillCircle(_x,_y,radius) { this.circle = true; this.radius=radius; return this; }, strokeCircle() { return this; },
        fillRoundedRect(){return this;},strokeRoundedRect(){return this;},destroy(){this.clear();},
      };
      graphics.push(graphic);
      return graphic;
    }, text(x,y,text) {
      const item={x,y,text,visible:true,setDepth(){return this;},setVisible(value){this.visible=value;return this;},
        setPosition(x,y){this.x=x;this.y=y;return this;},setText(value){this.text=value;return this;},
        destroy(){this.visible=false;this.text='';}};
      texts.push(item);return item;
    } },
  };
  const side = new PlayerSide('bottom', testMap);
  const board = side.board;
  board.tiles[0].unit = unit;
  const deployment = { draggedTile: null };
  let position = { kind: 'tile', index: 0 };
  const controller = new BattleController(scene, side, deployment,
    { positionAt: () => position });
  const pointer = { id: 1, primaryDown: true, x: 187.5, y: 602.5 };
  const render = () => controller.render([], 0);
  return { scene, deployment, pointer, render, range: graphics[0], panel: texts[0],
    side, setPosition: next => { position = next; } };
}

for (const event of ['pointerup', 'pointerupoutside']) {
  test(`按住显示，${event} 后选中状态正确`, () => {
    const { scene, pointer, render, range, panel } = setup();
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, true);
    scene.input.emit(event, pointer);
    render();
    assert.equal(range.circle, event === 'pointerup');
    assert.equal(panel.visible, event === 'pointerup');
  });
}

test('开始拖动立即清除范围，拖动中后续帧及松手不恢复', () => {
  const { scene, pointer, render, range, deployment } = setup();
  scene.input.emit('pointerdown', pointer);
  render();
  assert.equal(range.circle, true);
  deployment.draggedTile = 0;
  scene.input.emit('pointermove', pointer);
  assert.equal(range.circle, false);
  render();
  assert.equal(range.circle, false);
  deployment.draggedTile = null;
  scene.input.emit('pointerup', pointer);
  render();
  assert.equal(range.circle, false);
});

test('待放置栏、空格和其他区域均不显示范围且关闭面板', () => {
  const { scene, pointer, render, range, panel, setPosition } = setup();
  scene.input.emit('pointerdown',pointer);scene.input.emit('pointerup',pointer);assert.equal(panel.visible,true);
  for (const position of [{ kind: 'slot', index: 0 }, { kind: 'tile', index: 1 }, null]) {
    setPosition(position);
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, false);
    assert.equal(panel.visible,false);
    scene.input.emit('pointerup', pointer);
  }
});

test('其他手指松开不影响当前按住；失焦会清除，退出场景会移除监听', () => {
  const { scene, pointer, render, range } = setup();
  scene.input.emit('pointerdown', pointer);
  render();
  scene.input.emit('pointerup', { ...pointer, id: 2 });
  assert.equal(range.circle, true);
  scene.game.events.emit('blur');
  assert.equal(range.circle, false);
  render();
  assert.equal(range.circle, false);
  scene.events.emit('shutdown');
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
    assert.equal(scene.input.listenerCount(event), 0);
  }
  assert.equal(scene.game.events.listenerCount('blur'), 0);
});

test('属性面板点击后显示实时数值，切换单位后同步切换，移走单位自动关闭', () => {
  const { scene, side, pointer, panel, render, range, setPosition } = setup();
  scene.input.emit('pointerdown', pointer);
  scene.input.emit('pointerup', { ...pointer, primaryDown: false });
  assert.match(panel.text, /刃兵  Lv\.1/);
  assert.match(panel.text, /攻速：1\.25 次\/秒/);
  side.board.tiles[1].unit = { type: '弓', level: 2 };
  side.combat.syncBoard();
  setPosition({ kind: 'tile', index: 1 });
  scene.input.emit('pointerdown', pointer);
  scene.input.emit('pointerup', { ...pointer, primaryDown: false });
  render();
  assert.match(panel.text, /狙兵  Lv\.2/);
  assert.equal(range.circle, true);
  side.board.tiles[1].unit = null;
  side.combat.syncBoard(); render();
  assert.equal(panel.visible, false);
  assert.equal(range.circle, false);
});

test('面板与范围在拖动、暂停和场景销毁时清除', () => {
  const { scene, side, pointer, panel, render, deployment, range } = setup();
  scene.input.emit('pointerdown', pointer);scene.input.emit('pointerup', pointer);
  assert.equal(panel.visible, true);
  scene.input.emit('pointerdown', pointer);
  deployment.draggedTile = 0;
  scene.input.emit('pointermove', { ...pointer, x: pointer.x + 9 });
  assert.equal(panel.visible, false);
  assert.equal(range.circle, false);
  scene.input.emit('pointerup', pointer);
  deployment.draggedTile = null;
  scene.input.emit('pointerdown', pointer);scene.input.emit('pointerup', pointer);
  assert.equal(panel.visible, true);
  side.pause();render();
  assert.equal(panel.visible, false);
  scene.events.emit('shutdown');
  assert.equal(panel.visible, false);
});

test('属性文本以真实间隔换算攻速、75px换算格数，Lv5经验显示MAX', () => {
  const { side } = setup({ type: '枪', level: 1 });
  const ordinary = side.combat.getUnitCombatSnapshot(0);
  assert.match(formatUnitCombatSnapshot(ordinary), /攻速：1\.25 次\/秒/);
  assert.match(formatUnitCombatSnapshot(ordinary), /射程：2\.5 格/);
  const max = formatUnitCombatSnapshot({ ...ordinary, kind: 'hero', name: '小美', level: 5,
    exp: { current: 0, required: Infinity }, skill: { name: '顺序打击', status: '冷却：就绪',
      description: '中距离单体普攻' } });
  assert.match(max, /经验：MAX/);
  assert.match(max, /技能：顺序打击/);
});


test('上下动态棋盘使用同一正常填色与网格，中央分界带宽6px',()=>{
 const p=pve(),objects=p.objects.get(p.game);
 const boardTiles=objects.filter(o=>o.kind==='rectangle'&&o.width===testMap.cellSize&&o.height===testMap.cellSize
   &&(o.color===0xd1b98f||o.color===0xe7e2d6));
 assert.equal(boardTiles.length,testMap.spaces.length*2);
 for(let i=0;i<testMap.spaces.length;i++){
  const upper=boardTiles[i],lower=boardTiles[i+testMap.spaces.length];
  assert.equal(upper.color,lower.color);assert.deepEqual(upper.stroke,lower.stroke);
  assert.equal(upper.alpha,undefined);assert.equal(lower.alpha,undefined);
 }
 const dividers=objects.filter(o=>o.kind==='rectangle'&&o.color===0x899184&&o.height===6);
 assert.equal(dividers.length,1);
});

test('v0.541保持顶部、放大紧凑七槽、竖向椭圆被动栏和上移来财提示',()=>{
 const p=pve(),objects=p.objects.get(p.game);
 assert.equal(p.text(75,55),'Ⅱ');assert.equal(p.text(170,55),'$ 20');assert.equal(p.text(625,55),'第 1 波');
 assert.equal(objects.some(o=>o.text==='乐 GAME'||o.text.includes('每秒')),false);
 for(const x of [183,279,375,471,567])assert.ok(objects.some(o=>o.kind==='rectangle'&&o.x===x&&o.y===1018&&o.width===90&&o.height===90));
 for(const x of [80,670])assert.ok(objects.some(o=>o.kind==='rectangle'&&o.x===x&&o.y===1018&&o.width===74&&o.height===86));
 for(const x of [120,630])for(const y of [1110,1186,1262])assert.ok(objects.some(o=>o.kind==='ellipse'&&o.x===x&&o.y===y&&o.width===64&&o.height===70));
 assert.equal(objects.some(o=>o.text==='待放置'),false);
 assert.equal(p.text(375,1158),'来财 $10');
 const button=objects.find(o=>o.interactive===true&&o.x===375&&o.y===1158);
 assert.equal(button.width,280);assert.equal(button.height,154);
 assert.ok(objects.some(o=>o.kind==='graphics'&&o.draws.some(d=>d[0]==='fillRoundedRect'&&d[3]===280&&d[4]===154&&d[5]===20)));
 for(let i=0;i<11;i++)p.click(375,1158);
 assert.equal(p.text(375,1264),'美金不足，请等待资源增长');assert.equal(p.text(375,1158),'来财 $12');
 assert.equal(button.y,1158);p.run(10000);assert.equal(p.text(375,1264),'美金不足，请等待资源增长');
});


test('暂停只提供继续和返回主页，取消保持冻结，确认清理旧局并保留loadout',()=>{
 const p=pve();p.run(1000);p.click(75,55);
 assert.equal(p.objects.get(p.overlay).some(o=>o.text==='重新开始'),false);
 const old=p.game.match;const frozen=p.snapshot();
 p.click(375,p.result.resultSnapshot?1190:875);assert.equal(p.text(375,565,p.overlay),'确定返回主页？');
 p.click(220,765);p.run(1000);assert.equal(p.snapshot(),frozen);assert.equal(old.status,'paused');
 p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);assert.equal(old.status,'destroyed');assert.equal(p.game.match,null);
 assert.equal(p.ready.startState,'READY');assert.equal(p.game.events.listenerCount('update'),0);
 p.click(375,p.result.resultSnapshot?1070:765);assert.notEqual(p.game.match,old);assert.equal(p.game.match.timeline.elapsedMs,0);
});

test('枪弓长按预览半径与实际索敌配置完全一致，点击后保持选中',()=>{
 for(const [type,level,expected]of [['枪',1,187.5],['枪',5,187.5],['弓',1,187.5],['弓',2,206.25],['弓',3,225],['弓',4,243.75],['弓',5,262.5]]){
   const {scene,pointer,render,range}=setup({type,level});
   scene.input.emit('pointerdown',pointer);render();assert.equal(range.radius,expected);
   scene.input.emit('pointerup',pointer);render();assert.equal(range.circle,true);
 }
});


function farmerGame(){
 const p=pve(false);p.click(375,885);p.click(155,920);p.click(375,835);p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);
 return p;
}
const farmCash=p=>p.objects.get(p.game).filter(o=>o.kind==='text'&&/^\$[0-9]+$/.test(o.text)&&o.visible&&o.y>532);
const farmMoney=p=>Number(p.text(170,55).slice(2));

test('Farmer badge and hit area enlarge equally on both sides, stay inside battlefield and only bottom can collect',()=>{
 const p=pve(),views=[],rewards=[];
 for(const displaySide of ['bottom','top']){
  const side=p.game.sides[displaySide],farmer={kind:'farmer',type:'农',level:1};
  side.board.tiles[0].unit=farmer;side.farmers.update(12000);
  const view=new FarmerView(p.game,testMap,side,()=>true,()=>{},displaySide,displaySide==='bottom');views.push(view);
  view.refresh();
  const box=p.objects.get(p.game).findLast(o=>o.kind==='rectangle'&&o.color===0xf3d975&&o.visible);
  const text=p.objects.get(p.game).findLast(o=>o.kind==='text'&&o.text==='$1'&&o.visible);
  assert.equal(box.width,90);assert.equal(box.height,38);assert.equal(text.style.fontSize,'29px');
  assert.ok(box.width/64>=1.35&&box.width/64<=1.5);assert.ok(box.height/28>=1.35&&box.height/28<=1.5);
  const centers=[...testMap.cells,...testMap.path].map(cell=>boardProjection(testMap,750,displaySide).point(cell));
  const half=testMap.cellSize*1.125/2,bounds=box.getBounds();
  assert.ok(bounds.x>=Math.min(...centers.map(c=>c.x))-half);
  assert.ok(bounds.x+bounds.width<=Math.max(...centers.map(c=>c.x))+half);
  assert.ok(bounds.y>=Math.min(...centers.map(c=>c.y))-half);
  assert.ok(bounds.y+bounds.height<=Math.max(...centers.map(c=>c.y))+half);
  const center=boardProjection(testMap,750,displaySide).point(testMap.cells[0]);
  assert.ok(bounds.y>center.y+32||bounds.y+bounds.height<center.y-13.5); // 不遮住农/Lv文字。
  assert.equal(bounds.contains(box.x+44,box.y+18),true); // 原64×28点击范围以外仍可点。
  assert.equal(box.interactive===true,displaySide==='bottom');
  assert.equal(box.listenerCount('pointerdown'),displaySide==='bottom'?1:0);
  rewards.push({side,farmer,view,box,text});
 }
 const top=rewards[1],before=top.side.recruitment.money;
 top.box.emit('pointerdown',{},0,0,{stopPropagation(){}});assert.equal(top.side.recruitment.money,before);
 assert.ok(top.side.farmers.states.get(top.farmer).reward);
 const bottom=rewards[0],money=bottom.side.recruitment.money;
 bottom.box.emit('pointerdown',{},0,0,{stopPropagation(){}});
 assert.equal(bottom.side.recruitment.money,money+1);assert.equal(bottom.box.visible,false);assert.equal(bottom.text.visible,false);
 top.side.farmers.update(5000);top.view.refresh();assert.equal(top.box.visible,false);assert.equal(top.text.visible,false);
 views.forEach(view=>view.destroy());
});

test('农民生产/收益过期暂停冻结，领取不触发拖拽，重复点击/过期旧对象不加钱',()=>{
 const random=Math.random,speed=combatConfig.enemy.moveSpeed;
 try{
  combatConfig.enemy.moveSpeed=0;Math.random=()=>0.97;const p=farmerGame();
  p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
  assert.ok(p.objects.get(p.game).some(o=>o.text==='农'));assert.equal(p.text(164.0625,555.6875),'');
  p.run(11990);p.click(75,55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);
  p.click(375,p.result.resultSnapshot?1070:765);p.run(10);assert.equal(farmCash(p).length,1);
  const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===farmerRewardVisual.width&&o.height===farmerRewardVisual.height);
  const emit=()=>badge.emit('pointerdown',{},0,0,{stopPropagation(){}});
  p.click(75,55);const ready=p.snapshot(),money=farmMoney(p);p.run(10000);emit();assert.equal(farmMoney(p),money);assert.equal(p.snapshot(),ready);
  p.click(375,p.result.resultSnapshot?1070:765);p.run(4990);assert.equal(farmCash(p).length,1);
  const before=farmMoney(p);let stopped=false;
  badge.emit('pointerdown',{},0,0,{stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.equal(farmMoney(p),before+1);emit();assert.equal(farmMoney(p),before+1);assert.equal(farmCash(p).length,0);
  p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.drag([164.0625,574.0625],[248.4375,574.0625]);assert.equal(farmCash(p)[0].x,248.4375);
  const prior=farmMoney(p);p.run(5000);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),prior); // 未领取的农民收益过期，不自动加钱。
  p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.drag([248.4375,574.0625],[183,1018]);assert.equal(farmCash(p).length,0);
  p.drag([183,1018],[248.4375,574.0625]);p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.click(75,55);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);p.click(375,p.result.resultSnapshot?1070:765);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);
  emit();assert.equal(farmMoney(p),20);assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.text(120,1110),'农民');
  p.run(12000);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);assert.equal(p.game.time._active.length,0);
 }finally{Math.random=random;combatConfig.enemy.moveSpeed=speed;}
});
for(const win of [true,false])test('农民'+(win?'胜利':'失败')+'时收益冻结不可领取，再来一局清空并保留农民loadout',()=>{
 const random=Math.random;
 try{
  Math.random=()=>0.97;const p=farmerGame();
  p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
  p.run(12000);
  const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===farmerRewardVisual.width&&o.height===farmerRewardVisual.height);
  finishMatch(p,win);assert.equal(p.text(375,180,p.overlay),win?'胜利':'失败');
  const ended=p.snapshot(),money=farmMoney(p);p.run(30000);badge?.emit('pointerdown',{},0,0,{stopPropagation(){}});
  assert.equal(p.snapshot(),ended);assert.equal(farmMoney(p),money);
   p.click(375,p.result.resultSnapshot?1070:765);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);assert.equal(p.text(120,1110),'农民');
  p.click(375,1158);assert.ok(p.objects.get(p.game).some(o=>o.text==='农'));
  assert.equal(p.game.events.listenerCount('update'),1);
 }finally{Math.random=random;}
});


function equippedV56() {
 const p=pve(false, 100);p.click(375,885);
 for(const [x,y] of [[155,920],[300,920],[155,630]]){p.click(x,y);p.click(375,835);}
 p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);return p;
}
function dropUpgrade(p,x,y,eventType='pointerup') {
 p.click(80,1018);
 p.game.input.emit('pointermove',{id:1,x,y,primaryDown:true});
 p.game.input.emit(eventType,{id:1,x,y,primaryDown:false});
}
test('升级符真实输入：50秒CD、暂停冻结、非法释放/移出保留ready、合法拖放升级与互斥',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{
  combatConfig.enemy.moveSpeed=0;Math.random=()=>0;const p=equippedV56();
  assert.equal(p.text(80,1018),'升级符\n50s');assert.equal(p.text(120,1110),'农民');assert.equal(p.text(120,1186),'招贤榜');
  p.click(375,1158);dropUpgrade(p,183,1018);assert.equal(p.text(80,1018),'升级符\n50s');
  p.run(7000);assert.equal(p.text(80,1018),'升级符\n43s');p.click(75,55);const frozen=p.snapshot();p.run(30000);
  assert.equal(p.snapshot(),frozen);p.click(375,p.result.resultSnapshot?1070:765);p.run(42990);assert.equal(p.text(80,1018),'升级符\n1s');p.run(10);
  assert.equal(p.text(80,1018),'升级符\n可用');dropUpgrade(p,375,50);assert.equal(p.text(80,1018),'升级符\n可用');
  dropUpgrade(p,183,1018,'pointerupoutside');assert.equal(p.text(80,1018),'升级符\n可用');
  p.click(80,1018);assert.equal(p.text(80,1018),'升级符\n拖动中');const money=farmMoney(p);p.click(375,1158);assert.equal(farmMoney(p),money);
  // 第二根手指不能在道具拖动时移动普通单位。
  p.game.input.emit('pointerdown',{id:2,x:183,y:1018,primaryDown:true});
  p.game.input.emit('pointermove',{id:2,x:164.0625,y:574.0625,primaryDown:true});
  p.game.input.emit('pointerup',{id:2,x:164.0625,y:574.0625,primaryDown:false});
  p.game.input.emit('pointerup',{id:1,x:183,y:1018,primaryDown:false});
  assert.equal(p.text(80,1018),'升级符\n50s');assert.equal(p.text(375,1264),'道具使用成功');
  assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.2'));
  p.run(50000);p.click(80,1018);p.click(75,55);assert.equal(p.text(80,1018),'升级符\n可用');
  p.run(1000);p.click(375,p.result.resultSnapshot?1070:765);p.game.input.emit('pointerup',{id:1,x:279,y:1018});assert.equal(p.text(80,1018),'升级符\n可用');
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
test('回主页取消保持暂停；确认清理计时器/技能/农民收益/主动CD并保留装备，连续返回不重复循环',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{
  combatConfig.enemy.moveSpeed=0;const p=equippedV56();
  for(let round=0;round<3;round++){
   // 共享字小美与农民都部署，制造运行中的技能、生产与战斗。
   for(const [type,to] of [['小',[164.0625,574.0625]],['美',[248.4375,574.0625]],['农',[332.8125,574.0625]]]){
    Math.random=()=>recruitRoll(p,type);p.click(375,1158);p.drag([183,1018],to);
   }
   p.run(12000);assert.equal(farmCash(p).length,1);
   const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===farmerRewardVisual.width&&o.height===farmerRewardVisual.height),clock=p.game.time;
   p.click(75,55);assert.equal(p.text(375,875,p.overlay),'返回主页');p.click(375,p.result.resultSnapshot?1190:875);
   assert.equal(p.text(375,565,p.overlay),'确定返回主页？');assert.equal(p.text(375,655,p.overlay),'当前对局进度将丢失。');
   const frozen=p.snapshot();p.run(30000);p.click(220,765);assert.equal(p.text(375,565,p.overlay),'已暂停');assert.equal(p.isActive(),false);
   p.run(10000);assert.equal(p.snapshot(),frozen);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);
   assert.equal(p.ready.startState,'READY');assert.equal(p.text(375,765,p.ready),'开始对战');
   assert.equal(clock._active.length,0);assert.equal(clock._pendingInsertion.length,0);
   assert.equal(p.game.events.listenerCount('update'),0);assert.equal(p.game.events.listenerCount('resume'),0);assert.equal(p.game.input.listenerCount('pointerup'),0);assert.equal(p.globalEvents.listenerCount('blur'),0);
   assert.equal(farmCash(p).length,0);const homepage=p.snapshot();p.run(60000);assert.equal(p.snapshot(),homepage);
   p.click(375,885);assert.equal(p.text(125,410,p.items),'农民');p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);
   assert.equal(p.text(80,1018),'升级符\n50s');assert.equal(p.text(120,1110),'农民');assert.equal(p.text(120,1186),'招贤榜');
   assert.equal(farmMoney(p),100);badge.emit('pointerdown',{},0,0,{stopPropagation(){}});assert.equal(farmMoney(p),100);
   assert.equal(p.text(625,55),'第 1 波');assert.equal(p.text(670.3125,941.5625),'♥♥♥');
   assert.equal(p.objects.get(p.game).some(o=>o.y>532&&o.text.startsWith('Lv.')),false);assert.equal(p.game.events.listenerCount('update'),1);
   p.run(1000);assert.equal(farmMoney(p),100);assert.equal(p.game.time._active.length,0);
  }
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
for(const win of [true,false])test('升级符在'+(win?'胜利':'失败')+'后停止CD且重开重新充能',()=>{
 const p=equippedV56();p.run(5000);finishMatch(p,win);
  assert.equal(p.text(375,180,p.overlay),win?'胜利':'失败');const frozen=p.snapshot();p.run(30000);assert.equal(p.snapshot(),frozen);
  p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.text(80,1018),'升级符\n50s');assert.equal(p.text(120,1186),'招贤榜');
  p.run(5000);p.click(75,55);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.text(80,1018),'升级符\n50s');
  assert.equal(p.game.events.listenerCount('update'),1);p.run(1000);assert.equal(farmMoney(p),100);
});


function equippedV57(){const p=pve(false);p.click(375,885);
 for(const [x,y] of [[155,920],[300,630],[445,630]]){p.click(x,y);p.click(375,835);}
 p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);return p;
}
function dragActive(p,slot,x,y){p.click(slot,1018);p.game.input.emit('pointermove',{id:1,x,y,primaryDown:true});p.game.input.emit('pointerup',{id:1,x,y,primaryDown:false});}
test('v0.57两主动槽拖放：点金手无CD及时刷新钱，卖农民移除收益；如律令暂停冻结且失败不耗CD',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{combatConfig.enemy.moveSpeed=0;const p=equippedV57();
  assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(p.text(670,1018),'急急如\n律令\n20s');
  Math.random=()=>.99;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);p.run(12000);assert.equal(farmCash(p).length,1);
  const money=farmMoney(p);dragActive(p,80,164.0625,574.0625);assert.equal(farmMoney(p),money+1);assert.equal(farmCash(p).length,0);
  dragActive(p,80,279,1018);assert.equal(farmMoney(p),money+2);assert.equal(p.text(80,1018),'点金手\n可用');
  p.click(75,55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);p.click(375,p.result.resultSnapshot?1070:765);p.run(12000);
  assert.equal(p.text(670,1018),'急急如\n律令\n可用');dragActive(p,670,375,1018);assert.equal(p.text(670,1018),'急急如\n律令\n可用'); // 农民非法
  Math.random=()=>0;p.click(375,1158);dragActive(p,670,183,1018);assert.equal(p.text(670,1018),'急急如\n律令\n20s');
  p.run(20000);dragActive(p,670,183,1018);assert.equal(p.text(670,1018),'急急如\n律令\n可用');
  p.drag([183,1018],[164.0625,574.0625]);dragActive(p,670,164.0625,574.0625);assert.equal(p.text(670,1018),'急急如\n律令\n可用');
   p.click(75,55);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(farmMoney(p),20);
  p.click(75,55);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);assert.equal(p.game.events.listenerCount('update'),0);assert.equal(p.game.input.listenerCount('pointerup'),0);
   p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(farmMoney(p),20);
   assert.equal(p.game.events.listenerCount('update'),1);p.run(1000);assert.equal(farmMoney(p),20);assert.equal(p.game.time._active.length,0);
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
for(const win of [true,false])test('v0.57结算'+(win?'胜利':'失败')+'停止两道具，重开清空单位和强化',()=>{
 const p=equippedV57();p.run(5000);finishMatch(p,win);assert.equal(p.text(375,180,p.overlay),win?'胜利':'失败');
 const snapshot=p.snapshot();p.run(30000);dragActive(p,80,183,1018);assert.equal(p.snapshot(),snapshot);
 p.click(375,p.result.resultSnapshot?1070:765);assert.equal(farmMoney(p),20);assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(p.text(80,1018),'点金手\n可用');
 assert.equal(p.objects.get(p.game).some(o=>o.y>532&&o.text.startsWith('Lv.')),false);
});


test('v0.571 每张背包卡片及详情均明确区分主动/被动',()=>{
 const p=pve(false);p.click(375,885);
 for(const [x,y,category] of [[155,920,'被动'],[300,920,'被动'],[155,630,'主动'],[300,630,'主动'],[445,630,'主动']]){
  assert.equal(p.text(x,y+25,p.items),category);p.click(x,y);
  assert.ok(p.objects.get(p.items).some(o=>o.visible&&o.text==='类型：'+category+'道具'));
  const shade=p.objects.get(p.items).findLast(o=>o.kind==='rectangle'&&o.width===750);shade.emit('pointerdown');
 }
});

test('没有被动不自动涨钱；铁饭碗只在装备局内每10秒发$2，暂停冻结，重开后重新计时',()=>{
 const plain=pve();plain.run(10000);assert.equal(plain.text(170,55),'$ 20');
 const p=pve(false);p.click(375,885);p.click(445,920);p.click(375,835);p.click(375,1200);p.click(375,p.result.resultSnapshot?1070:765);
 assert.equal(p.text(170,55),'$ 20');p.run(9990);assert.equal(p.text(170,55),'$ 20');
 p.click(75,55);p.run(30000);assert.equal(p.text(170,55),'$ 20');
 p.click(375,p.result.resultSnapshot?1070:765);p.run(10);assert.equal(p.text(170,55),'$ 22');
 p.run(4000);p.click(75,55);p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);p.click(375,p.result.resultSnapshot?1070:765);
 assert.equal(p.text(170,55),'$ 20');p.run(9990);assert.equal(p.text(170,55),'$ 20');
 p.run(10);assert.equal(p.text(170,55),'$ 22');
});

test('来财按钮展示当局实际价格，余额不足时不改变招募次数',()=>{
 const p=pve();assert.equal(p.text(170,55),'$ 20');assert.equal(p.text(375,1158),'来财 $10');
 p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
 p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
 p.run(2000);p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
});

test('大厅使用米白背景、头像和主体占位，开始对战为主入口',()=>{
 const p=pve(false),objects=p.objects.get(p.ready);
 const background=objects.find(o=>o.kind==='rectangle'&&o.width===750&&o.height===1334);
 assert.equal(background?.color,READY_BACKGROUND_COLOR);
 assert.equal(background.color,0xf7f3e8);
 assert.ok(objects.some(o=>o.kind==='rectangle'&&o.width===600&&o.height===450));
 assert.equal(p.text(270,95,p.ready),'乐玩家');
 assert.equal(objects.filter(o=>o.kind==='graphics').length,0);
 assert.equal(p.text(375,765,p.ready),'开始对战');
 assert.equal(p.text(375,885,p.ready),'道具');
 p.click(375,885);assert.equal(p.objects.has(p.items),true);
});

test('v0.60-B 两个真实Side独立创建，显式测试阵容由自身状态动态渲染',()=>{
 const p=topRenderFixture(pve()),{bottom,top}=p.game.sides;
 assert.notEqual(bottom,top);assert.notEqual(bottom.board,top.board);
 assert.notEqual(bottom.recruitment,top.recruitment);
 assert.notEqual(bottom.combat,top.combat);assert.notEqual(bottom.farmers,top.farmers);
 assert.notEqual(bottom.activeItems,top.activeItems);
 assert.equal(bottom.board.tiles[0].unit,null);
 assert.equal(top.board.tiles[0].unit.type,'小');assert.equal(top.board.tiles[1].unit.type,'美');
 assert.equal(top.combat.heroLinks.length,1);assert.equal(top.combat.heroLinks[0].heroId,'xiaomei');
 assert.equal(top.board.tiles[10].unit.type,'六');assert.equal(top.board.tiles[3].bonusType,'attack');
 const objects=p.objects.get(p.game),point=boardProjection(testMap,750,'top').point(testMap.cells[10]);
 assert.ok(objects.some(o=>o.kind==='text'&&o.text==='Zz'&&o.x===point.x&&o.y===point.y-19*1.125));
 assert.ok(objects.some(o=>o.kind==='graphics'&&o.scale<0&&o.draws.some(d=>d[0]==='strokeRect'&&d[3]===150)));
 const bonusPoint=boardProjection(testMap,750,'top').point(testMap.cells[3]);
 assert.ok(objects.some(o=>o.kind==='text'&&o.text==='⚔️'&&o.x===bonusPoint.x));
 assert.equal(objects.filter(o=>o.kind==='rectangle'&&o.y===1018&&o.width===90).length,5);
 assert.equal(objects.some(o=>o.interactive===true&&o.y>100&&o.y<532),false);
 const topMoney=top.recruitment.money;
 top.board.tiles[3].bonusType='range';top.board.tiles[10].unit=null;p.run(10);
 assert.equal(bottom.board.tiles[3].bonusType,'none');assert.equal(top.recruitment.money,topMoney);
 assert.ok(objects.some(o=>o.kind==='text'&&o.text==='🎯'&&o.x===bonusPoint.x));
 assert.equal(objects.some(o=>o.kind==='text'&&o.text==='Zz'&&o.x===point.x),false);
 p.run(12000);
 const topReward=objects.find(o=>o.kind==='text'&&o.text==='$2'&&o.y<532&&o.visible);
 assert.ok(topReward);
 assert.equal(objects.some(o=>o.kind==='rectangle'&&o.x===topReward.x&&o.y===topReward.y&&o.interactive===true),false);
});

test('v0.60-B 180°仅用于显示：格心、连续路径和文字方向正确，逻辑配方不反转',()=>{
 const top=boardProjection(testMap,750,'top'),bottom=boardProjection(testMap,750,'bottom');
 const first=testMap.cells[0],topPoint=top.point(first),bottomPoint=bottom.point(first);
 assert.deepEqual(topPoint,{x:750-bottomPoint.x,y:2*(testMap.mirrorY*1.125-103.75)-bottomPoint.y});
 assert.equal(BATTLEFIELD_DIVIDER_PX,6);
 const pathPoint={x:(testMap.path[0].x+testMap.path[1].x)/2,y:(testMap.path[0].y+testMap.path[1].y)/2};
 const upperPath=top.point(pathPoint),lowerPath=bottom.point(pathPoint);
 assert.equal(upperPath.x,750-lowerPath.x);
 assert.equal(upperPath.y+lowerPath.y,2*(testMap.mirrorY*1.125-103.75));
 assert.equal(top.graphicsTransform().scale,-bottom.graphicsTransform().scale);
 const p=topRenderFixture(pve());assert.equal(p.game.sides.top.combat.heroLinks[0].heroId,'xiaomei');
 assert.equal(p.game.sides.top.board.tiles[0].unit.type,'小');
 assert.equal(p.game.sides.top.board.tiles[1].unit.type,'美');
 const objects=p.objects.get(p.game);
 assert.ok(objects.some(o=>o.kind==='text'&&o.text==='乐'&&o.y<532&&o.scale>0));
 assert.ok(objects.some(o=>o.kind==='rectangle'&&o.color===0x899184&&o.height===6));
 assert.equal(testMap.cellSize,75);assert.equal(testMap.cells.length,28);
});

test('v0.60-B 两边同号敌人各归其战斗实例，top没有玩家输入和操作HUD',()=>{
 const p=topRenderFixture(pve()),{bottom,top}=p.game.sides;
 const bottomEnemy=bottom.combat.spawnEnemy(),topEnemy=top.combat.spawnEnemy();
 assert.ok(topEnemy);assert.notEqual(topEnemy,bottomEnemy);
 bottom.recruitment.slots[0]={type:'刀',level:1};
 assert.equal(bottom.drop({kind:'slot',index:0},{kind:'tile',index:0}),'move');
 bottomEnemy.moveSpeed=0;bottomEnemy.maxHp=100000;bottomEnemy.hp=100000;
 bottomEnemy.distance=600;
 topEnemy.moveSpeed=0;topEnemy.maxHp=100000;topEnemy.hp=100000;
 topEnemy.distance=187.5;topEnemy.x=225;topEnemy.y=677.5;
 top.combat.enemies.splice(1);
 const bottomMoney=bottom.recruitment.money;
 p.run(1500);
 assert.equal(bottomEnemy.hp,100000);assert.equal(bottom.recruitment.money,bottomMoney);
 assert.ok(topEnemy.hp<100000);
 const uprightBar=p.objects.get(p.game).find(o=>o.kind==='graphics'&&o.draws.some(d=>d[0]==='fillRect'&&d[3]===45&&d[4]===6.75));
 assert.ok(uprightBar);assert.notEqual(uprightBar.scale,-1.125);
 assert.equal(p.game.input.listenerCount('pointerdown'),2);
 assert.equal(p.game.input.listenerCount('pointermove'),3);
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text.startsWith('来财')).length,1);
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='rectangle'&&o.y===1018&&o.width===90).length,5);
 const topUnit=top.board.tiles[0].unit;
 const target=boardProjection(testMap,750,'top').point(testMap.cells[0]);
 p.drag([target.x,target.y],[183,1018]);
 assert.equal(top.board.tiles[0].unit,topUnit);
});

test('v0.60-B 暂停冻结两个Side，返回主页后新匹配只留下新Side与新棋盘对象',()=>{
 const p=pve(),old=p.game.sides;
 // 隔离暂停/销毁验证，不依赖低血首怪能否活过AI的第一轮攻击。
 const enemy=old.top.combat.spawnEnemy();enemy.hp=enemy.maxHp=100000;
 p.run(100);const oldDistance=enemy.distance;
 p.click(75,55);p.run(5000);assert.equal(enemy.distance,oldDistance);
 p.click(375,p.result.resultSnapshot?1190:875);p.click(530,765);p.click(375,p.result.resultSnapshot?1070:765);
 assert.notEqual(p.game.sides.top,old.top);assert.notEqual(p.game.sides.bottom,old.bottom);
 assert.equal(old.top.combat.enemies.length,0);assert.equal(old.bottom.combat.enemies.length,0);
 assert.equal(p.game.sides.top.board.tiles[0].unit,null);
 assert.deepEqual(p.game.sides.top.recruitment.slots,Array(5).fill(null));
 assert.equal(p.game.sides.top.board.tiles.filter(t=>t.unlocked).length,6);
 assert.equal(p.game.sides.bottom.board.tiles[0].unit,null);
 assert.equal(p.game.events.listenerCount('update'),1);
 p.run(10);assert.equal(p.game.time._active.length,0);
});

test('v0.60-C HUD显示共享wave及双方独立HP，积怪时仍按计划出怪',()=>{
 const p=pve();assert.equal(p.game.sides.bottom.progress,null);assert.equal(p.game.sides.top.progress,null);
 // Freeze movement only in this fixture so an empty board survives to wave2.
 const speed=combatConfig.enemy.moveSpeed;combatConfig.enemy.moveSpeed=0;
 try { p.run(waveStartForWave(2)); } finally { combatConfig.enemy.moveSpeed=speed; }
 assert.equal(p.text(625,55),'第 2 波');assert.ok(p.game.sides.bottom.combat.enemies.length>0);
 for(const s of Object.values(p.game.sides))assert.ok(s.combat.enemies.some(e=>e.spawnEventId===11));
 for(const [id,count]of [['bottom',1],['top',2]])for(let i=0;i<count;i++){
  const s=p.game.sides[id],e=s.combat.spawnEnemy();e.distance=s.combat.path.totalLength-.001;
 }
 p.run(20);assert.equal(p.text(670.3125,941.5625),'♥♥');
 const goal=testMap.path.at(-1),point=boardProjection(testMap,750,'top').point({x:goal.x,y:goal.y-24});
 assert.equal(p.text(point.x,point.y),'♥');assert.equal(p.game.match.status,'running');
});

test('v0.60-C 同步漏怪显示平局；旧update回调在重开后不能再运行旧Match',()=>{
 const p=pve(),old=p.game.match,callbacks=p.game.events.listeners('update');
 for(const s of Object.values(old.sides))for(let i=0;i<3;i++){
  const e=s.combat.spawnEnemy();e.distance=s.combat.path.totalLength-.001;
 }
 p.run(420);assert.equal(p.text(375,180,p.overlay),'平局');assert.equal(old.result,'draw');
 const ended=p.snapshot();old.update(250);p.run(5000);assert.equal(p.snapshot(),ended);
 p.click(375,p.result.resultSnapshot?1070:765);const fresh=p.game.match;assert.notEqual(fresh,old);
 assert.equal(old.status,'destroyed');assert.deepEqual(fresh.health,{bottom:3,top:3});
 const initial=p.snapshot();callbacks.forEach(fn=>fn(20000,250));assert.equal(p.snapshot(),initial);
 assert.equal(fresh.timeline.elapsedMs,0);assert.equal(fresh.bottomSide.recruitment.money,20);
 assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.game.time._active.length,0);
});

test('v0.61 正式GameScene从空top开局，通过Match反应延迟招募，无开发阵容',()=>{
 const p=pve(),s=p.game.sides.top;
 assert.equal(s.recruitment.money,20);assert.deepEqual(s.recruitment.slots,Array(5).fill(null));
 assert.equal(s.board.tiles.filter(t=>t.unlocked).length,6);assert.ok(s.board.tiles.every(t=>t.unit===null&&t.bonusType==='none'));
 assert.ok(Object.isFrozen(s.recruitment.loadout));assert.equal(s.recruitment.loadout.active.length,2);
 assert.ok(s.recruitment.loadout.passive.some(i=>i.id==='farmer'));
 p.run(aiConfig.timing.initialReactionMs.min-10);assert.equal(s.recruitment.successfulRecruits,0);
 p.run(aiConfig.timing.initialReactionMs.max-aiConfig.timing.initialReactionMs.min+40);
 assert.equal(s.recruitment.successfulRecruits,1);assert.equal(s.recruitment.money,10);assert.equal(s.recruitment.nextCost,12);
 assert.ok(s.recruitment.slots.every(i=>i!==null));
 assert.equal(p.game.sides.bottom.recruitment.successfulRecruits,0);assert.equal(p.game.sides.bottom.recruitment.money,20);
});

test('v0.61-A top保持正常武将等级/镜像但隐藏EXP，bottom保留EXP条',()=>{
 const p=topRenderFixture(pve()),s=p.game.sides.bottom;
 s.recruitment.slots[0]={kind:'heroLetter',type:'小',level:1};s.recruitment.slots[1]={kind:'heroLetter',type:'美',level:1};
 s.drop({kind:'slot',index:0},{kind:'tile',index:0});s.drop({kind:'slot',index:1},{kind:'tile',index:1});
 const bottom=[...s.heroes.links.values()][0],top=[...p.game.sides.top.heroes.links.values()][0];
 bottom.currentExp=5;top.currentExp=5;p.run(10);
 const bars=sign=>p.objects.get(p.game).filter(o=>o.kind==='graphics'&&Math.sign(o.scale)===sign)
  .flatMap(o=>o.draws).filter(d=>d[0]==='fillRect'&&d[4]===3);
 assert.equal(bars(-1).length,0);assert.equal(bars(1).length,2);assert.ok(bars(1).some(d=>d[3]>0&&d[3]<138));
 const point=boardProjection(testMap,750,'top').point({x:top.origin.x,y:top.origin.y+15});
 assert.equal(p.text(point.x,point.y),'Lv.2');assert.equal(top.currentExp,5);
});

test('v0.62-A HUD tracks highest started wave while the preceding wave is still spawning',()=>{
 const saved={...pressureConfig};let p;
 try{
  Object.assign(pressureConfig,{firstEnemyDelay:100,waveStartInterval:200,waves:[{hp:10,count:4}],spawnInterval:100});
  p=pve();
 }finally{delete pressureConfig.waveStartInterval;Object.assign(pressureConfig,saved);}
 p.run(300);assert.equal(p.text(625,55),'第 2 波');
 assert.equal(p.game.sides.bottom.combat.enemies.length,4);
 p.run(100);assert.equal(p.game.sides.bottom.combat.enemies.length,6);
 assert.equal(p.text(625,55),'第 2 波');
});

for(const win of [true,false])test('RESULT '+(win?'win':'lose')+' freezes immediately, overlay clock waits 400ms and displays immutable statistics',()=>{
 const p=pve();p.click(375,1158);const old=p.game.match;
 finishMatch(p,win,win?1:0,false);
 assert.equal(p.game.input.enabled,false);assert.equal(old.status,'ended');
 const snapshot=old.resultSnapshot,ended=p.snapshot(),time=old.timeline.elapsedMs;
 assert.equal(p.overlay.resultSnapshot,snapshot);assert.equal(p.text(375,180,p.overlay),undefined);
 const ui=()=>p.objects.get(p.overlay).filter(o=>o.kind==='text').map(o=>o.text);
 p.click(375,1158);p.click(75,55);p.drag([183,1018],[248,574]);
 p.run(370);assert.equal(ui().length,0);assert.equal(old.timeline.elapsedMs,time);assert.equal(p.snapshot(),ended);
 p.run(40);assert.equal(p.text(375,180,p.overlay),win?'胜利':'失败');
 assert.equal(p.text(375,300,p.overlay),'第 '+snapshot.waveReached+' 波');
 assert.equal(p.text(375,380,p.overlay),'击杀 '+snapshot.playerKills);
 assert.equal(p.text(375,460,p.overlay),'来财 '+snapshot.playerSuccessfulRecruits+' 次');
 assert.equal(p.text(375,540,p.overlay),'剩余 $'+snapshot.playerRemainingMoney);
 assert.equal(ui().some(t=>t.startsWith('乐：')),win);
 if(win)assert.equal(p.text(375,620,p.overlay),'乐：♥♥');
 assert.equal(ui().includes('已暂停'),false);p.run(1200);const resultUi=ui();p.run(5000);assert.deepEqual(ui(),resultUi);assert.equal(old.status,'destroyed');assert.equal(p.game.match,null);
});

test('RESULT draw has stats and both actions but no HP row',()=>{
 const p=pve();for(const side of Object.values(p.game.sides))for(let n=0;n<3;n++){
  const e=side.combat.spawnEnemy();e.distance=side.combat.path.totalLength-.001;
 }
 p.run(420);assert.equal(p.text(375,180,p.overlay),'平局');
 assert.equal(p.objects.get(p.overlay).some(o=>o.kind==='text'&&o.text.startsWith('乐：')),false);
 assert.equal(p.text(375,1070,p.overlay),'再来一局');assert.equal(p.text(375,1190,p.overlay),'返回主页');
});

test('RESULT home destroys old runtime, clears snapshot binding and restores both HOME controls',()=>{
 const p=pve(),old=p.game.match,kit=old.bottomSide.recruitment.loadout;finishMatch(p,false);
 const callbacks=p.game.events.listeners('update');p.click(375,p.result.resultSnapshot?1190:875);
 assert.equal(old.status,'destroyed');assert.equal(p.game.match,null);assert.equal(p.overlay.resultSnapshot,null);
 assert.equal(p.text(375,765,p.ready),'开始对战');assert.equal(p.text(375,885,p.ready),'道具');
 assert.equal(p.overlay.time._active.length,0);assert.equal(p.game.events.listenerCount('update'),0);
 callbacks.forEach(fn=>fn(10000,250));p.run(1000);assert.equal(p.game.match,null);
 p.click(375,p.result.resultSnapshot?1070:765);assert.notEqual(p.game.match,old);assert.deepEqual(p.game.match.bottomSide.recruitment.loadout,kit);
 assert.equal(p.game.match.resultSnapshot,null);assert.deepEqual(p.game.match.kills,{bottom:0,top:0});
});

test('five RESULT/rematch cycles replace Match, opponent, statistics, Le views and all stale callbacks',()=>{
 const p=pve();const kit=p.game.match.bottomSide.recruitment.loadout;
 for(let round=0;round<5;round++){
  const old=p.game.match,setup=p.game.battleSetup,objects=p.objects.get(p.game),updates=p.game.events.listeners('update');
  p.click(375,1158);finishMatch(p,round%2===0);
  const snapshot=old.resultSnapshot,button=p.objects.get(p.overlay).findLast(o=>o.kind==='rectangle'&&o.x===375&&o.y===1070);
  const oldActions=button.listeners('pointerdown');p.click(375,p.result.resultSnapshot?1070:765);
  const fresh=p.game.match;assert.notEqual(fresh,old);assert.equal(old.status,'destroyed');
  assert.notEqual(p.game.battleSetup.opponentProfile.id,setup.opponentProfile.id);
  assert.equal(p.overlay.resultSnapshot,null);assert.notEqual(fresh.resultSnapshot,snapshot);assert.equal(fresh.resultSnapshot,null);
  assert.deepEqual(fresh.kills,{bottom:0,top:0});assert.equal(fresh.bottomSide.recruitment.successfulRecruits,0);
  assert.equal(fresh.bottomSide.recruitment.money,20);assert.deepEqual(fresh.health,{bottom:3,top:3});assert.equal(fresh.timeline.wave,1);
  assert.deepEqual(fresh.bottomSide.recruitment.loadout,kit);assert.notEqual(p.objects.get(p.game),objects);
  const state=p.snapshot();updates.forEach(fn=>fn(100000,250));oldActions.forEach(fn=>fn());
  assert.equal(p.game.match,fresh);assert.equal(p.snapshot(),state);assert.equal(fresh.timeline.elapsedMs,0);
  assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.overlay.time._active.length,0);
  assert.equal(p.matching.tweens.tweens.length,0);
 }
});

test('destroying result overlay before delay invalidates its pending timer',()=>{
 const p=pve();finishMatch(p,false,0,false);const objects=p.objects.get(p.overlay);
 p.shutdown(p.overlay);p.run(1000);
 assert.equal(p.overlay.resultSnapshot,null);assert.equal(objects.filter(o=>o.kind==='text').length,0);
 assert.equal(p.overlay.time._active.length,0);
});

function freshProgress(){let raw=null;const storage={getItem:()=>raw,setItem:(_k,v)=>{raw=v;}};
 return {storage,progress:new PlayerProgress(storage)};}

test('v0.64 new HOME shows zero progress, owned-only inventory and default frugal loadout',()=>{
 const {progress,storage}=freshProgress(),p=pve(false,20,false,{playerProgress:progress});
 assert.equal(p.text(555,110,p.ready),'🪙 0');assert.equal(p.text(375,190,p.ready),'对局 0 · 胜利 0 · 最高波次 0');
 assert.equal(p.game.match,null);assert.equal(p.setupHistory.length,0);assert.equal(progress.hasSeenWelcome(),false);
 p.click(375,885);assert.equal(p.text(375,100,p.items),'道具');assert.equal(p.text(155,910,p.items),'勤俭持家');
 const cards=p.objects.get(p.items).filter(o=>o.kind==='rectangle'&&o.width===116);assert.equal(cards.length,1);
 assert.equal(p.text(375,630,p.items),'暂无');
 const ownedTexts=p.objects.get(p.items).filter(o=>o.kind==='text').map(o=>o.text);
 for(const def of itemDefinitions.filter(d=>d.id!=='frugal_home'))assert.equal(ownedTexts.includes(def.name),false);
 p.click(155,920);p.click(375,835);assert.deepEqual(new PlayerProgress(storage).save.equippedPassiveItemIds,[]);
 p.click(375,1200);assert.deepEqual(p.ready.inventory.filter(i=>i.equipped),[]);
 p.click(375,885);p.click(155,920);p.click(375,835);assert.deepEqual(new PlayerProgress(storage).save.equippedPassiveItemIds,['frugal_home']);
});

test('v0.64 welcome requires first start intent, locks HOME and starts exactly one matching after claim',()=>{
 const {progress,storage}=freshProgress(),p=pve(false,20,false,{playerProgress:progress});
 const random=Math.random;try{Math.random=()=>{throw Error('welcome must not use gameplay RNG');};p.ready.requestStartGame();}finally{Math.random=random;}
 assert.equal(p.ready.startState,'WELCOME');assert.equal(p.game.match,null);assert.equal(p.setupHistory.length,0);
 assert.equal(p.text(375,360,p.ready),'恭喜！');assert.equal(progress.save.coins,0);
 const before=progress.save;assert.deepEqual(before.ownedItemIds,['frugal_home']);assert.deepEqual(before.equippedPassiveItemIds,['frugal_home']);
 assert.equal(new PlayerProgress(storage).hasSeenWelcome(),true);
 for(let n=0;n<10;n++){p.ready.requestStartGame();p.click(375,885);}
 assert.equal(p.objects.has(p.items),false);assert.equal(p.setupHistory.length,0);
 const claim=p.objects.get(p.ready).findLast(o=>o.kind==='rectangle'&&o.y===1030),callbacks=claim.listeners('pointerdown');
 p.click(375,1030);callbacks.forEach(fn=>fn({},0,0,{stopPropagation(){}}));
 assert.equal(p.ready.startState,'MATCHING');assert.equal(p.setupHistory.length,1);assert.equal(p.startCount(),0);
 assert.equal(progress.save.coins,0);assert.deepEqual(progress.save.ownedItemIds,['frugal_home']);
 p.finishFlow();assert.equal(p.startCount(),1);assert.deepEqual(p.game.match.bottomSide.recruitment.loadout.passive,[{id:'frugal_home',level:1}]);
 finishMatch(p,false);p.click(375,p.result.resultSnapshot?1190:875);p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.ready.startState,'MATCHING');assert.equal(p.setupHistory.length,2);
});

test('v0.64 shutdown during welcome invalidates old claim handler; reset/force reset re-enable presentation',()=>{
 const {progress}=freshProgress(),p=pve(false,20,false,{playerProgress:progress});p.click(375,p.result.resultSnapshot?1070:765);
 const callbacks=p.objects.get(p.ready).findLast(o=>o.kind==='rectangle'&&o.y===1030).listeners('pointerdown');
 p.shutdown(p.ready);callbacks.forEach(fn=>fn({},0,0,{stopPropagation(){}}));assert.equal(p.setupHistory.length,0);
 progress.reset();const fresh=pve(false,20,false,{playerProgress:progress});fresh.click(375,765);assert.equal(fresh.ready.startState,'WELCOME');
});

test('v0.64 loaded welcome event skips gift; rematch also bypasses gift without changing intro flow',()=>{
 const {progress,storage}=freshProgress();progress.markWelcomeSeen();const loaded=new PlayerProgress(storage);
 const p=pve(false,20,true,{playerProgress:loaded});p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.startCount(),1);
 assert.equal(p.objects.get(p.ready).some(o=>o.text==='立即领取'),false);
 const old=p.game.match;finishMatch(p,true);p.click(375,p.result.resultSnapshot?1070:765);assert.equal(p.startCount(),2);assert.notEqual(p.game.match,old);
 assert.equal(p.game.presentationPhase,'INTRO');assert.deepEqual(p.game.match.bottomSide.recruitment.loadout.passive,[{id:'frugal_home',level:1}]);
});

test('v0.64 formal result commits once and displays coins; HOME refreshes permanent info, battle HUD does not',()=>{
 const {progress,storage}=freshProgress();progress.markWelcomeSeen();const p=pve(true,20,true,{playerProgress:progress});
 const snapshot=()=>p.objects.get(p.game).filter(o=>o.kind==='text').map(o=>o.text);
 assert.equal(snapshot().some(t=>t.includes('金币')),false);
 finishMatch(p,true);const result=p.result.resultSnapshot;
 assert.equal(progress.save.coins,3);assert.equal(progress.save.stats.matchesPlayed,1);assert.equal(progress.save.stats.wins,1);
 assert.equal(p.text(375,710,p.overlay),'本局金币 +3');
 p.shutdown(p.result);p.result.create({snapshot:result,coinReward:3});
 p.run(410);assert.equal(progress.save.coins,3);assert.equal(progress.save.stats.matchesPlayed,1);
 p.click(375,p.result.resultSnapshot?1190:875);assert.equal(p.text(555,110,p.ready),'🪙 3');assert.equal(p.text(375,190,p.ready),'对局 1 · 胜利 1 · 最高波次 1');
 assert.deepEqual(new PlayerProgress(storage).save,progress.save);
 p.click(375,p.result.resultSnapshot?1070:765);finishMatch(p,false);assert.equal(progress.save.coins,4);assert.equal(progress.save.stats.matchesPlayed,2);assert.equal(progress.save.stats.wins,1);
 p.click(375,p.result.resultSnapshot?1070:765);assert.equal(progress.save.coins,4);assert.equal(p.game.match.bottomSide.recruitment.money,20);
});

test('v0.64 start loadout cannot promote forged scene-owned flags into permanent ownership',()=>{
 const {progress}=freshProgress();progress.markWelcomeSeen();const p=pve(false,20,true,{playerProgress:progress});
 const farmer=p.ready.inventory.find(i=>i.id==='farmer');farmer.owned=true;farmer.equipped=true;
 p.click(375,p.result.resultSnapshot?1070:765);assert.equal(progress.save.ownedItemIds.includes('farmer'),false);
 assert.equal(p.game.match.bottomSide.recruitment.loadout.passive.some(i=>i.id==='farmer'),false);
 assert.deepEqual(p.game.match.bottomSide.recruitment.loadout.passive,[{id:'frugal_home',level:1}]);
});

function shopProgress(seed={}) {
 let raw=JSON.stringify({...defaultPlayerSave(),...seed});
 const storage={getItem:()=>raw,setItem:(_key,value)=>{raw=value;}};
 return {storage,progress:new PlayerProgress(storage,undefined,()=>0)};
}

test('v0.65 SHOP uses persistent shelf, disables unaffordable purchase and does not refresh on visits',()=>{
 const {progress}=shopProgress(),p=pve(false,20,false,{playerProgress:progress}),before=progress.save;
 p.click(375,985);assert.equal(p.text(375,210,p.shop),'金币：0');
 assert.equal(p.text(375,320,p.shop),'再完成 2 局刷新货架');
 assert.equal(p.objects.get(p.shop).filter(o=>o.kind==='rectangle'&&o.width===190).length,3);
 p.click(155,595);assert.equal(p.text(375,480,p.shop),'农民');assert.equal(p.text(375,750,p.shop),'金币 12');
 assert.equal(p.text(375,835,p.shop),'金币不足');p.click(375,835);assert.deepEqual(progress.save,before);
 p.click(635,430);p.click(375,1190);p.click(375,985);assert.deepEqual(progress.save,before);
});

test('v0.65 purchase updates wallet and sold label without restock or auto-equip; duplicate callbacks are safe',()=>{
 const {progress,storage}=shopProgress({coins:30}),p=pve(false,20,false,{playerProgress:progress});
 const shelf=progress.save.shop.shelfItemIds;p.click(375,985);p.click(155,595);
 const button=p.objects.get(p.shop).findLast(o=>o.kind==='rectangle'&&o.y===835),callbacks=button.listeners('pointerdown');
 p.click(375,835);callbacks.forEach(fn=>fn());assert.equal(progress.save.coins,18);
 assert.equal(p.text(155,680,p.shop),'✓ 已购买');assert.equal(p.text(375,210,p.shop),'金币：18');
 assert.deepEqual(progress.save.shop.shelfItemIds,shelf);assert.deepEqual(progress.save.equippedPassiveItemIds,['frugal_home']);
 assert.deepEqual(new PlayerProgress(storage).save,progress.save);
 p.click(155,595);assert.equal(p.objects.get(p.shop).findLast(o=>o.kind==='text'&&o.visible&&o.y===835).text,'已购买');p.click(375,835);assert.equal(progress.save.coins,18);
});

test('v0.65 fewer than three shelf cards and final purchase immediately show complete collection',()=>{
 const owned=itemDefinitions.filter(d=>d.id!=='farmer').map(d=>d.id);
 const {progress}=shopProgress({coins:12,ownedItemIds:owned}),p=pve(false,20,false,{playerProgress:progress});
 p.click(375,985);assert.equal(p.objects.get(p.shop).filter(o=>o.kind==='rectangle'&&o.width===190).length,1);
 p.click(155,595);p.click(375,835);assert.equal(p.text(375,820,p.shop),'已全部收集');
 assert.equal(p.text(155,680,p.shop),'✓ 已购买');
});

test('v0.65 equipped rectangle edges have input, empty slots do not, and both paths use the same detail',()=>{
 const {progress,storage}=shopProgress(),p=pve(false,20,false,{playerProgress:progress});p.click(375,885);
 const slot=p.objects.get(p.items).find(o=>o.kind==='rectangle'&&o.x===125&&o.y===410);
 assert.equal(slot.interactive,true);assert.ok(slot.getBounds().contains(81,445));
 slot.emit('pointerdown',{x:81,y:445});assert.equal(p.text(375,480,p.items),'勤俭持家');assert.equal(p.text(375,835,p.items),'卸下');
 p.click(375,835);assert.equal(slot.interactive,false);assert.deepEqual(new PlayerProgress(storage).save.equippedPassiveItemIds,[]);
 p.click(155,920);assert.equal(p.objects.get(p.items).filter(o=>o.kind==='text'&&o.visible&&o.text==='勤俭持家'&&o.y===480).length,1);
 p.click(375,835);assert.equal(slot.interactive,true);assert.deepEqual(progress.save.equippedPassiveItemIds,['frugal_home']);
 const empty=p.objects.get(p.items).find(o=>o.kind==='rectangle'&&o.x===325&&o.y===270);assert.equal(empty.interactive,false);
});

test('v0.65 inventory full feedback preserves both active equipment slots',()=>{
 const {progress}=shopProgress({ownedItemIds:itemDefinitions.map(d=>d.id),equippedActiveItemIds:['upgrade_talisman','golden_hand']}),
 p=pve(false,20,false,{playerProgress:progress});p.click(375,885);p.click(445,630);p.click(375,835);
 assert.equal(p.text(375,835,p.items),'主动道具栏已满，请先卸下一件。');
 assert.deepEqual(progress.save.equippedActiveItemIds,['upgrade_talisman','golden_hand']);
 assert.ok(p.objects.get(p.items).some(o=>o.kind==='rectangle'&&o.height===2&&o.y===795));
});

test('v0.65 RESULT is full-screen after 400ms, old Match destroyed, rewards never committed by page',()=>{
 const {progress}=shopProgress();progress.markWelcomeSeen();const p=pve(true,20,true,{playerProgress:progress}),old=p.game.match;
 finishMatch(p,true,0,false);p.run(390);assert.notEqual(old.status,'destroyed');assert.equal(p.result.resultSnapshot,null);
 p.run(20);assert.equal(old.status,'destroyed');assert.equal(p.game.match,null);assert.ok(Object.isFrozen(p.result.resultSnapshot));
 const page=p.objects.get(p.result),background=page.find(o=>o.kind==='rectangle'&&o.width===750);
 assert.equal(background.height,1334);assert.equal(p.text(375,710,p.result),'本局金币 +3');
 for(const y of [1070,1190]){const button=page.find(o=>o.kind==='rectangle'&&o.y===y);assert.ok(button.y+button.height/2<1334);assert.ok(button.y-button.height/2>900);}
 const before=progress.save;p.run(1000);assert.deepEqual(progress.save,before);assert.equal(progress.save.shop.matchesTowardRefresh,1);
 p.click(375,1190);assert.equal(p.game.match,null);assert.deepEqual(progress.save,before);
});

test('v0.65 welcome uses enlarged colorful typography and joke price remains presentation only',()=>{
 const {progress}=shopProgress(),p=pve(false,20,false,{playerProgress:progress});p.click(375,765);
 const objects=p.objects.get(p.ready),headline=objects.find(o=>o.text==='恭喜！');
 assert.ok(Number.parseInt(headline.style.fontSize)>=80);
 const panel=objects.find(o=>o.kind==='rectangle'&&o.width===650);assert.equal(panel.height,850);
 assert.ok(objects.some(o=>o.text==='价值998金币'));assert.equal(progress.save.coins,0);
 assert.ok(new Set(objects.filter(o=>o.kind==='text'&&o.visible).map(o=>o.style.color)).size>=4);
 p.click(375,1030);assert.equal(p.ready.startState,'MATCHING');assert.equal(p.setupHistory.length,1);
 assert.equal(progress.save.coins,0);assert.deepEqual(progress.save.ownedItemIds,['frugal_home']);
});

test('v0.65 newly registered owned items paginate without changing inventory lists or save schema',()=>{
 const extra=Array.from({length:12},(_,i)=>({id:`future_${i}`,name:`道具${i}`,category:'passive',description:'测试扩展',shopPrice:6,shopEligible:true}));
 itemDefinitions.push(...extra);
 try{
  const {progress}=shopProgress({ownedItemIds:itemDefinitions.map(d=>d.id)}),p=pve(false,20,false,{playerProgress:progress});
  p.click(375,885);assert.equal(p.text(375,1120,p.items),'1 / 3');
  const cards=()=>p.objects.get(p.items).filter(o=>o.kind==='rectangle'&&o.visible&&o.width===116&&o.y>=920);
  assert.equal(cards().length,8);assert.ok(cards().every(o=>o.y+o.height/2<1120));
  p.click(515,1120);assert.equal(p.text(375,1120,p.items),'2 / 3');
  p.click(155,920);assert.equal(p.text(375,480,p.items),'道具0');p.click(375,835);
  assert.ok(progress.save.equippedPassiveItemIds.includes('future_0'));
 }finally{itemDefinitions.splice(-extra.length);}
});

const starRank=(divisionIndex,stars)=>({kind:'stars',divisionIndex,stars});
const pointRank=points=>({kind:'points',points});
for(const [name,rank,win]of [['gain',starRank(0,0),true],['break',starRank(0,1),false],['promotion',starRank(14,5),true],['demotion',starRank(15,0),false],['points',pointRank(140),true],['master promotion',pointRank(90),true],['master demotion',pointRank(0),false]])
 test('v0.66 rank animation '+name+' uses frozen settlement and ends with correct display/clean temporary objects',()=>{
  const {progress}=shopProgress({rank,seenOneTimeEventIds:[WELCOME_EVENT]});const p=pve(true,20,true,{playerProgress:progress});
  finishMatch(p,win);const snapshot=p.result.resultSnapshot,change=progress.rankChangeFor(snapshot.matchId),permanent=progress.save;
  assert.ok(Object.isFrozen(change)&&Object.isFrozen(change.afterRank));assert.equal(p.text(375,810,p.result),rankTitle(rank));
  p.run(1400);assert.equal(p.text(375,810,p.result),rankTitle(change.afterRank));
  if(change.afterRank.kind==='points')assert.equal(p.text(375,875,p.result),rankProgress(change.afterRank));
  else if(rank.kind==='stars')assert.deepEqual(p.objects.get(p.result).filter(o=>o.kind==='text'&&o.visible&&o.y===875&&Number.parseInt(o.style.fontSize)===38).map(o=>o.text),[...rankProgress(change.afterRank)]);
  else assert.equal(p.text(375,875,p.result),rankProgress(change.afterRank));
  assert.equal(p.objects.get(p.result).filter(o=>o.kind==='triangle'&&o.visible).length,0);
  assert.deepEqual(progress.save,permanent);assert.equal(p.result.tweens.getTweens().length,0);
  p.click(375,1190);assert.equal(p.game.match,null);assert.deepEqual(progress.save,permanent);
 });

test('v0.66 leaving RESULT during animation invalidates old tweens and never settles again',()=>{
 const {progress}=shopProgress({rank:starRank(0,1),seenOneTimeEventIds:[WELCOME_EVENT]}),p=pve(true,20,true,{playerProgress:progress});
 finishMatch(p,false);const before=progress.save,oldTweens=p.result.tweens.getTweens(),callbacks=oldTweens.flatMap(t=>t.callbacks.onComplete?[t.callbacks.onComplete.func]:[]);
 p.click(375,1070);assert.equal(p.startCount(),2);assert.equal(p.result.tweens.getTweens().length,0);
 callbacks.forEach(fn=>fn());p.run(1000);assert.deepEqual(progress.save,before);assert.equal(p.game.match.running,true);
});

test('v0.66 profile editing validates, persists, refreshes HOME and next VS uses current identity',()=>{
 const {progress,storage}=shopProgress();let value='',destroyed=0;
 const p=pve(false,20,false,{playerProgress:progress,nicknameInputFactory:()=>({value:()=>value,destroy:()=>destroyed++})});
 p.click(255,110);const before=progress.save;p.click(375,765);assert.equal(p.ready.startState,'READY');assert.equal(p.setupHistory.length,0);
 p.click(375,870);assert.deepEqual(progress.save,before);
 value='  新的玩家  ';p.click(240,640);p.click(375,870);assert.equal(destroyed,1);
 assert.deepEqual(progress.save.profile,{nickname:'新的玩家',avatarId:'cat'});assert.deepEqual(new PlayerProgress(storage).save.profile,progress.save.profile);
 assert.equal(p.text(100,110,p.ready),avatarSymbol('cat'));assert.equal(p.text(270,95,p.ready),'新的玩家');
 progress.markWelcomeSeen();p.click(375,765);untilPhase(p,'VS_HOLD');
 const texts=p.objects.get(p.matching).filter(o=>o.kind==='text'&&o.visible).map(o=>o.text);
 assert.ok(texts.includes('新的玩家')&&texts.includes(avatarSymbol('cat'))&&texts.includes(rankDisplay(progress.save.rank)));
});

test('v0.66 profile shutdown removes native input adapter once and old save handlers become inert',()=>{
 const {progress}=shopProgress();let cleaned=0;const p=pve(false,20,false,{playerProgress:progress,nicknameInputFactory:()=>({value:()=> '新名字',destroy:()=>cleaned++})});
 p.click(255,110);const actions=p.objects.get(p.ready).findLast(o=>o.kind==='rectangle'&&o.y===870).listeners('pointerdown');
 const before=progress.save;p.shutdown(p.ready);actions.forEach(fn=>fn());assert.equal(cleaned,1);assert.deepEqual(progress.save,before);
});

test('v0.66 VS high rank uses points without star slots, timing and first spawn remain unchanged',()=>{
 const {progress}=shopProgress({rank:pointRank(140),seenOneTimeEventIds:[WELCOME_EVENT]}),p=pve(false,20,false,{playerProgress:progress});
 p.click(375,765);untilPhase(p,'VS_HOLD');const texts=p.objects.get(p.matching).filter(o=>o.kind==='text').map(o=>o.text);
 assert.ok(texts.includes('宗师 140分'));assert.equal(texts.some(t=>t.includes('★')||t.includes('☆')),false);
 assert.equal(flowConfig.vsEnterMs,400);assert.equal(flowConfig.vsHoldMs,1400);assert.equal(flowConfig.vsExitMs,500);assert.equal(pressureConfig.firstEnemyDelay,9500);
});

test('v0.66 settings reset requires confirmation, cancel retains progress, confirm clears only game save and welcome returns',()=>{
 const seed={...defaultPlayerSave(),coins:29,rank:pointRank(150),profile:{nickname:'旧玩家',avatarId:'fox'},ownedItemIds:itemDefinitions.map(d=>d.id),equippedActiveItemIds:['upgrade_talisman'],equippedPassiveItemIds:['farmer'],stats:{matchesPlayed:9,wins:5,highestWave:11,totalKills:50},seenOneTimeEventIds:[WELCOME_EVENT],settledMatchIds:['old'],shop:{shelfItemIds:['farmer'],matchesTowardRefresh:1}};
 const {progress,storage}=shopProgress(seed),p=pve(false,20,false,{playerProgress:progress}),before=progress.save;
 p.click(690,80);p.click(375,760);assert.deepEqual(progress.save,before);p.click(220,930);assert.deepEqual(progress.save,before);
 p.click(375,765);assert.equal(p.setupHistory.length,0);p.click(375,760);p.click(530,930);
 const save=progress.save;assert.equal(save.coins,0);assert.deepEqual(save.rank,starRank(0,0));assert.equal(save.profile.nickname,'乐玩家');
 assert.deepEqual(save.stats,defaultPlayerSave().stats);assert.deepEqual(save.ownedItemIds,['frugal_home']);assert.deepEqual(save.equippedPassiveItemIds,['frugal_home']);
 assert.deepEqual(save.equippedActiveItemIds,[]);assert.deepEqual(save.seenOneTimeEventIds,[]);assert.deepEqual(save.settledMatchIds,[]);
 assert.equal(save.shop.shelfItemIds.length,3);assert.equal(save.shop.matchesTowardRefresh,0);assert.deepEqual(new PlayerProgress(storage).save,save);
 assert.equal(p.text(555,110,p.ready),'🪙 0');p.click(375,765);assert.equal(p.ready.startState,'WELCOME');assert.equal(p.game.match,null);
});

test('v0.66 full RESULT vertical groups and buttons stay separated within 750x1334',()=>{
 const p=pve();finishMatch(p,true);p.run(1400);const objects=p.objects.get(p.result);
 assert.equal(p.text(375,710,p.result),'本局金币 +3');assert.equal(p.text(375,810,p.result),'黑铁 IV');
 for(const y of [1070,1190]){const control=objects.find(o=>o.kind==='rectangle'&&o.y===y);assert.ok(control.y-control.height/2>990);assert.ok(control.y+control.height/2<1334);}
 assert.ok(objects.filter(o=>o.kind==='text'&&o.visible).every(o=>o.y>=180&&o.y<=1190));
});

const {heroRegistry:getExpandedHeroes}=await import('../src/config/heroes.ts');
for(const def of getExpandedHeroes)test(`v0.67-B ${def.name} actual renderer exposes its radius, card color and readable level`,()=>{
 const p=pve(true,100),side=p.game.sides.bottom;
 const random=Math.random;
 try{for(let i=0;i<2;i++){
  Math.random=()=>recruitRoll(p,def.letters[i]);p.click(375,1158);
  p.drag([183,1018],[164.0625+i*84.375,574.0625]);
 }}finally{Math.random=random;}p.run(20);
 const link=side.combat.heroLinks[0];assert.equal(link.heroId,def.id);
 const pointer={id:1,x:164.0625,y:574.0625,primaryDown:true};p.game.input.emit('pointerdown',pointer);p.run(20);
 const graphics=p.objects.get(p.game).filter(o=>o.kind==='graphics'&&o.scale>0);
 assert.ok(graphics.some(g=>g.draws.some(d=>d[0]==='fillCircle'&&d[3]===def.baseAttackRange)));
 assert.ok(graphics.some(g=>g.draws.some(d=>d[0]==='lineStyle'&&d[2]===(def.cardColor==='purple'?0x9768b5:0xb49a50))));
 assert.ok(p.objects.get(p.game).some(o=>o.kind==='text'&&o.text.startsWith('Lv.1')));
 p.game.input.emit('pointerup',{...pointer,primaryDown:false});
 assert.equal(graphics.some(g=>g.draws.some(d=>d[0]==='fillCircle'&&d[3]===def.baseAttackRange)),true);
});

test('首次部署提示只在有可部署内容时显示，成功部署后本地完成且已有合法合并时提示合并',()=>{
 const p=pve(false,20,true);p.click(375,765);
 const random=Math.random;try{Math.random=()=>recruitRoll(p,'刀');p.click(375,1158);}finally{Math.random=random;}
 assert.equal(p.game.sides.bottom.recruitment.slots.filter(item=>item?.type==='刀').length,5);
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='text'&&o.x===375&&o.y===1264).findLast(o=>o.text)?.text,'拖动单位，把他们放上战场。');
 const tileIndex=p.game.sides.bottom.board.tiles.findIndex(tile=>tile.unlocked&&!tile.unit);
 assert.ok(tileIndex>=0);
 const point=boardProjection(testMap,750,'bottom').point(testMap.cells[tileIndex]);
 p.drag([183,1018],[point.x,point.y]);
 assert.equal(p.progress.save.tutorial.deploymentHintCompleted,true);
 p.run(5000);
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='text'&&o.x===375&&o.y===1264).findLast(o=>o.text)?.text,'相同兵种、相同等级，可以拖到一起升级。');
 p.drag([279,1018],[375,1018]);
 assert.equal(p.progress.save.tutorial.mergeHintCompleted,true);
});

test('首次获得HeroLetter提示只读征兵结果，显示时保存；重载后不会重复提示',()=>{
 const p=pve(false,20,true);p.click(375,765);
 const random=Math.random;try{Math.random=()=>recruitRoll(p,'小');p.click(375,1158);}finally{Math.random=random;}
 assert.ok(p.game.sides.bottom.recruitment.slots.every(item=>item?.type==='小'));
 assert.equal(p.progress.save.tutorial.heroLetterHintCompleted,false);
 p.run(5000);
 assert.equal(p.objects.get(p.game).filter(o=>o.kind==='text'&&o.x===375&&o.y===1264).findLast(o=>o.text)?.text, '收集正确的两个名字，可以组成武将。\n例如：小 + 美 → 小美');
 assert.equal(p.progress.save.tutorial.heroLetterHintCompleted,true);
 const reloaded=new PlayerProgress({getItem:()=>JSON.stringify(p.progress.save),setItem(){}});
 assert.equal(reloaded.save.tutorial.heroLetterHintCompleted,true);
});

test('HOME玩法入口进入说明页，五步内容可见且返回HOME',()=>{
 const p=pve(false);assert.equal(p.text(375,1185,p.ready),'？ 玩法');
 p.click(375,1185);
 assert.equal(p.text(375,90,p.howToPlay),'怎么玩？');
 for(const title of ['征兵','拖上战场','召唤武将','扩大战场','保护乐','别让乐死了。'])
  assert.ok(p.objects.get(p.howToPlay).some(object=>object.text===title));
 p.click(76,90);
 assert.equal(p.text(375,765,p.ready),'开始对战');
});
