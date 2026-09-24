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
const { testMap } = await import('../src/config/maps.ts');
const { createBoardState } = await import('../src/systems/board.ts');
const { BattleController } = await import('../src/combat/BattleController.ts');
const { GameScene } = await import('../src/scenes/GameScene.ts');
const { ReadyScene } = await import('../src/scenes/ReadyScene.ts');
const { ItemsScene } = await import('../src/scenes/ItemsScene.ts');
const { PveOverlayScene } = await import('../src/scenes/PveOverlayScene.ts');
const { waveConfig } = await import('../src/config/waves.ts');
const { gameConfig } = await import('../src/config/game.ts');
const { GAME_VERSION } = await import('../src/config/game.ts');
const { READY_BACKGROUND_COLOR } = await import('../src/config/ready.ts');
const { heroCombat } = await import('../src/config/heroes.ts');
const { combatConfig } = await import('../src/config/combat.ts');
const { skillConfigs } = await import('../src/config/skills.ts');
const { default: Clock } = await import('../node_modules/phaser/src/time/Clock.js');

// 使用真实场景、控制器和 Phaser Clock；仅替代渲染对象及场景调度。
function pve(startImmediately = true, startingMoney = gameConfig.initialMoney) {
  const game = new GameScene();
  const ready = new ReadyScene();
  const items = new ItemsScene();
  let itemsActive = false;
  const overlay = new PveOverlayScene();
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
        if (key === 'destroy') return () => { t.text = ''; t.visible = false; t.interactive = false; t.draws = []; return proxy; };
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
    scene.add.text = (x, y, text) => object('text', x, y).setText(text);
    scene.sys = { events: new EventEmitter() };
    scene.time = new Clock(scene);
  }
  function shutdown(scene) {
    scene.events.emit('shutdown');
    scene.time.shutdown();
    for (const item of objects.get(scene)) item.removeAllListeners();
  }
  game.scene = {
    pause: () => { active = false; },
    launch: (_key, data) => { prepare(overlay); overlayActive = true; overlay.create(data); },
  };
  ready.scene = {
    start: (key, data) => {
      if (key === 'ItemsScene') {
        shutdown(ready);readyActive=false;itemsActive=true;prepare(items);items.create(data);return;
      }
      assert.equal(key, 'GameScene');
      startCount++;
      shutdown(ready);
      readyActive = false;
      prepare(game);
      createGame(data);
    },
  };
  items.scene = { start: (key,data) => {
    assert.equal(key,'ReadyScene');shutdown(items);itemsActive=false;readyActive=true;prepare(ready);ready.create(data);
  } };
  overlay.scene = {
    resume: () => { active = true; game.events.emit('resume'); },
    stop: key => { if (key === 'GameScene') shutdown(game); else { shutdown(overlay); overlayActive = false; } },
    start: (key,data) => { if(key==='ReadyScene'){shutdown(overlay);overlayActive=false;readyActive=true;active=true;prepare(ready);ready.create(data);return;} assert.equal(key, 'GameScene'); shutdown(overlay); overlayActive = false; prepare(game); active = true; createGame(data); },
  };
  prepare(ready);
  ready.create();
  if (startImmediately) ready.requestStartGame();
  const text = (x, y, scene = game) => objects.get(scene).find(o => o.kind === 'text' && o.x === x && o.y === y)?.text;
  const click = (x, y) => {
    const scene = itemsActive ? items : readyActive ? ready : overlayActive ? overlay : game;
    const target = objects.get(scene).findLast(o => o.interactive === true && o.x === x && o.y === y);
    target?.emit('pointerdown', { id: 1, x, y, primaryDown: true }, 0, 0, { stopPropagation() {} });
  };
  const drag = (from, to) => {
    if (!active || overlayActive || readyActive || itemsActive) return;
    const p = { id: 1, primaryDown: true, x: from[0], y: from[1] };
    game.input.emit('pointerdown', p);
    game.input.emit('pointermove', { ...p, x: to[0], y: to[1] });
    game.input.emit('pointerup', { ...p, primaryDown: false, x: to[0], y: to[1] });
  };
  const run = ms => {
    for (let i = 0; i < ms; i += 10) {
      now += 10;
      if (!active) continue;
      const scene = itemsActive ? items : readyActive ? ready : game;
      scene.time.preUpdate();
      scene.time.update(now, 10);
      scene.events.emit('update', now, 10);
    }
  };
  const snapshot = () => JSON.stringify(objects.get(readyActive ? ready : game).map(o => ({ text: o.text, visible: o.visible, draws: o.draws })));
  return { game, ready, items, overlay, objects, text, click, drag, run, snapshot, isActive: () => active && !readyActive && !itemsActive,
    startCount: () => startCount, globalEvents };
}

test('背包详情、装卸返回、单局被动栏及连续重开保留loadout',()=>{
  const p=pve(false);assert.equal(p.text(375,885,p.ready),'道具');p.click(375,885);
  p.run(30000);assert.equal(p.objects.has(p.game),false);assert.equal(p.text(155,620,p.items),'农民');
  p.click(155,630);assert.equal(p.text(375,510,p.items),'农民');assert.equal(p.text(375,565,p.items),'类型：被动道具');
  assert.equal(p.text(375,655,p.items),'携带后，征兵时有概率出现农民。部署后的农民不会攻击，会周期性生产美金。');
  const description=p.objects.get(p.items).find(o=>o.kind==='text'&&o.y===655);
  assert.equal(description.advancedWrap,true);assert.equal(description.wrapWidth,490);
  assert.equal(description.fixedWidth,500);assert.ok(description.fixedWidth<590);
  const shade=p.objects.get(p.items).findLast(o=>o.kind==='rectangle'&&o.width===750);
  shade.emit('pointerdown');assert.equal(p.objects.get(p.items).some(o=>o.text==='装备'&&o.visible),false);
  p.click(155,630);p.click(375,815);assert.equal(p.text(125,410,p.items),'农民');
  p.click(155,630);assert.ok(p.objects.get(p.items).some(o=>o.text==='卸下'&&o.visible));p.click(375,815);
  assert.equal(p.text(125,410,p.items),'—');p.click(155,630);p.click(375,815);
  p.click(375,1200);assert.equal(p.ready.startState,'READY');p.click(375,885);
  assert.equal(p.text(125,410,p.items),'农民');p.click(375,1200);p.click(375,765);
  p.click(75, 55);p.run(10000);assert.equal(p.text(120,1110),'农民');p.click(375,765);
  for(let round=0;round<3;round++){
    assert.equal(p.text(120,1110),'农民');assert.equal(p.text(630,1262),'—');
    for(const x of [80,670])assert.notEqual(p.objects.get(p.game).find(o=>o.kind==='rectangle'&&o.x===x&&o.y===1018).interactive,true);
    p.run(1000);assert.equal(p.text(170, 55),'$ 20');
    p.run(60000);assert.equal(p.text(375,565,p.overlay),'失败');p.click(375,765);
    assert.equal(p.game.events.listenerCount('update'),2);assert.equal(p.text(625, 55),'第 1 波');
  }
  const counts=waveConfig.enemyCounts;
  try {
    waveConfig.enemyCounts=[1];p.run(30000);assert.equal(p.text(375,565,p.overlay),'胜利');
    p.click(375,765);assert.equal(p.text(120,1110),'农民');
  } finally { waveConfig.enemyCounts=counts; }
});

test('未装备农民开局被动栏为空',()=>{
  const p=pve();assert.equal(p.text(120,1110),'—');assert.equal(p.objects.get(p.game).some(o=>o.text==='农民'),false);
});

test('初始READY无对局控制器和计时器，长时间等待无敌人/资源/技能/EXP/操作', () => {
  const p = pve(false);
  assert.equal(p.ready.startState, 'READY');
  assert.equal(p.isActive(), false);
  assert.equal(p.text(375,565,p.ready), '乐 GAME');
  assert.equal(p.text(375,765,p.ready), '开始游戏');
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
  p.click(375,765);
  for (let i=0;i<10;i++) p.ready.requestStartGame();
  assert.equal(p.ready.startState, 'RUNNING');
  assert.equal(p.isActive(), true);
  assert.equal(p.startCount(), 1);
  assert.equal(p.text(170, 55), '$ 20');
  assert.equal(p.text(625, 55), '第 1 波');
  assert.equal(p.game.events.listenerCount('update'),2);
  p.run(990);assert.equal(p.text(170, 55), '$ 20');
  p.run(10);assert.equal(p.text(170, 55), '$ 20');
  assert.equal(p.game.time._active.length, 1);
  const enemyCircles = () => p.objects.get(p.game).filter(o=>o.kind==='graphics')
    .flatMap(o=>o.draws).filter(d=>d[0]==='fillCircle'&&d[3]===15);
  p.run(990);assert.equal(enemyCircles().length, 0);
  p.run(20);assert.equal(enemyCircles().length, 1);
  const random = Math.random;
  try { Math.random=()=>0;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]); }
  finally { Math.random=random; }
  assert.equal(p.text(170, 55), '$ 10');
  assert.equal(p.text(164.0625,574.0625), '');
  p.click(75, 55);assert.equal(p.text(375,565,p.overlay),'已暂停');
  p.click(375,765);assert.equal(p.isActive(),true);
});

test('双格视觉、休眠标识、拆开恢复、暂停、胜负及多次重开清理', () => {
  const random = Math.random;
  const counts = waveConfig.enemyCounts;
  const damage = heroCombat.damage;
  const skillDamage = skillConfigs.xiaomei_barrage.damage;
  try {
    const p = pve(true, 100);
    for (const win of [false, true, false]) {
      heroCombat.damage = win ? damage : 1;
      skillConfigs.xiaomei_barrage.damage = win ? skillDamage : 1;
      waveConfig.enemyCounts = win ? [1] : counts;
      Math.random = () => 15.5 / 20;
      p.click(375, 1158);
      p.drag([183,1018], [164.0625,574.0625]);
      assert.equal(p.text(164.0625,552.6875), 'Zz');
      assert.equal(p.objects.get(p.game).filter(o => o.text === 'Zz').length, 1);
      Math.random = () => 16.5 / 20;
      p.click(375, 1158);
      p.drag([183,1018], [248.4375,574.0625]);
      assert.equal(p.text(164.0625,552.6875), '');
      assert.equal(p.text(248.4375,552.6875), '');
      assert.equal(p.objects.get(p.game).some(o => o.text === '小美'), false);
      const boxes = p.objects.get(p.game).filter(o => o.kind === 'rectangle' && o.y === 574.0625 && [164.0625,248.4375].includes(o.x));
      assert.equal(boxes.length,4);
      assert.ok(boxes.slice(-2).every(o => !o.visible));
      const linkedBorder = () => p.objects.get(p.game).some(o => o.kind === 'graphics'
        && o.draws.some(d => d[0] === 'strokeRect' && d[3] === 150 && d[4] === 75));
      assert.equal(linkedBorder(), true);
      const pointer = { id: 1, x: 248.4375, y: 574.0625, primaryDown: true };
      p.game.input.emit('pointerdown', pointer);
      p.run(10);
      const range = p.objects.get(p.game).filter(o => o.kind === 'graphics').at(-2);
      assert.ok(range.draws.some(d => d[0] === 'fillCircle' && d[1] === 225));
      p.game.input.emit('pointermove', { ...pointer, x: 290 });
      assert.equal(linkedBorder(), false);
      assert.equal(p.text(164.0625,552.6875), 'Zz');
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
      p.click(375,765);p.run(90000);
      assert.equal(p.text(375,565,p.overlay),win?'胜利':'失败');
      const ended=p.snapshot();p.run(5000);p.drag([248.4375,574.0625],[183,1018]);
      assert.equal(p.snapshot(),ended);
      p.click(375,765);
      assert.equal(linkedBorder(),false);
      assert.equal(p.objects.get(p.game).some(o => ['小','美','Zz'].includes(o.text)),false);
      assert.equal(p.game.events.listenerCount('update'),2);
      p.run(2000);
      assert.equal(p.objects.get(p.game).some(o=>o.kind==='graphics'&&o.draws.some(d=>d[0]==='lineBetween')),false);
      // 恢复下一轮初始计时，确保新一局重复测试也完全走关闭/创建流程。
      p.run(30000);p.click(375,765);
    }
  } finally { Math.random=random;waveConfig.enemyCounts=counts;heroCombat.damage=damage;skillConfigs.xiaomei_barrage.damage=skillDamage; }
});

test('EXP条随参战击杀更新，暂停冻结，同字升级清零，拆开/重开清理', () => {
  const random = Math.random, enemyHp = combatConfig.enemy.maxHp;
  try {
    combatConfig.enemy.maxHp = 30;
    const p = pve(true, 100);
    Math.random = () => 15.5 / 20;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
    Math.random = () => 16.5 / 20;p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
    p.run(4500);
    assert.equal(p.text(206.25,590.9375),'Lv.1');
    const expBars = () => p.objects.get(p.game).filter(o=>o.kind==='graphics')
      .flatMap(o=>o.draws).filter(d=>d[0]==='fillRect'&&d[1]===156&&d[2]===635&&d[4]===3);
    assert.ok(expBars().some(d=>d[3]>0));
    p.click(75, 55);const paused=p.snapshot();p.run(10000);p.drag([279,1018],[248.4375,574.0625]);
    assert.equal(p.snapshot(),paused);p.click(375,765);
    Math.random = () => 15.5 / 20;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);p.run(10);
    assert.equal(p.text(206.25,590.9375),'Lv.2');assert.ok(expBars().some(d=>d[3]===0));
    p.drag([248.4375,574.0625],[183,1018]);p.run(10);
    assert.equal(expBars().length,0);assert.equal(p.text(164.0625,552.6875),'Zz');
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.2'));
    p.run(30000);const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,765);assert.equal(expBars().length,0);
    assert.equal(p.objects.get(p.game).some(o=>o.text==='Lv.2'),false);
    Math.random=()=>15.5/20;p.click(375,1158);assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
  } finally { Math.random=random; combatConfig.enemy.maxHp = enemyHp; }
});

test('小美名字闪烁由技能发动触发，暂停冻结CD和释放中伤害，重开清理闪烁', () => {
  const random=Math.random,speed=combatConfig.enemy.moveSpeed,hp=combatConfig.enemy.maxHp;
  try {
    combatConfig.enemy.moveSpeed=25;combatConfig.enemy.maxHp=100000;
    const p=pve(true, 100);
    Math.random=()=>15.5/20;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
    Math.random=()=>16.5/20;p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
    const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text==='小美'&&o.visible);
    p.run(9500);assert.equal(flashes().length,0);
    p.click(75, 55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);
    p.click(375,765);
    let seen=false;
    for(let ms=0;ms<6000&&!seen;ms+=10){p.run(10);seen=flashes().length>0;}
    assert.equal(seen,true);
    p.click(75, 55);const casting=p.snapshot();p.run(5000);assert.equal(p.snapshot(),casting);
    p.click(375,765);p.run(500);assert.equal(flashes().length,0);
    combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp;
    p.drag([248.4375,574.0625],[183,1018]);p.run(30000);
    assert.equal(p.text(375,565,p.overlay),'失败');const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,765);assert.equal(flashes().length,0);p.run(10000);assert.equal(flashes().length,0);
  } finally { Math.random=random;combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp; }
});

for (const [name,left,right,cd] of [['阿饼',17.5,18.5,14000],['小六',15.5,19.5,12000]]) {
  test(`${name}技能事件闪烁、充能及发动后暂停冻结、拆开结算和重开清理`, () => {
    const random=Math.random,speed=combatConfig.enemy.moveSpeed,hp=combatConfig.enemy.maxHp;
    try {
      combatConfig.enemy.moveSpeed=25;combatConfig.enemy.maxHp=100000;
      const p=pve(true, 100);
      Math.random=()=>left/20;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
      Math.random=()=>right/20;p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
      const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text===name&&o.visible);
      // 观察真实成长后的首次发动，不假定击杀升级前后的CD完全相同。
      p.run(1000);p.click(75, 55);const paused=p.snapshot();
      p.run(30000);p.drag([248.4375,574.0625],[183,1018]);assert.equal(p.snapshot(),paused);
      p.click(375,765);
      let seen=false;
      for(let ms=0;ms<cd+1500&&!seen;ms+=10){p.run(10);seen=flashes().length>0;}
      assert.equal(seen,true);
      p.click(75, 55);const casting=p.snapshot();p.run(20000);assert.equal(p.snapshot(),casting);
      combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp;
      p.click(375,765);p.drag([248.4375,574.0625],[183,1018]);p.run(10);assert.equal(flashes().length,0);
      p.run(60000);assert.equal(p.text(375,565,p.overlay),'失败');
      const ended=p.snapshot();p.run(20000);assert.equal(p.snapshot(),ended);
      p.click(375,765);p.run(1000);assert.equal(flashes().length,0);
      assert.equal(p.game.events.listenerCount('update'),2);assert.equal(p.game.time._active.length,1);
      assert.equal(p.objects.get(p.game).some(o=>o.text===name||o.text==='Zz'),false);
    } finally { Math.random=random;combatConfig.enemy.moveSpeed=speed;combatConfig.enemy.maxHp=hp; }
  });
}

test('PVE暂停冻结敌人、攻击、出兵与真实收入计时器；禁止操作并原位恢复', () => {
  const p = pve();
  const random = Math.random;
  try {
    Math.random = () => 0.35; // 固定征到弓，保证暂停前已有自动攻击。
    p.click(375, 1158);
  } finally { Math.random = random; }
  p.drag([183,1018], [164.0625,574.0625]);
  p.run(2500);
  const elapsed = p.game.time._active[0].elapsed;
  p.click(75, 55);
  assert.equal(p.text(375, 565, p.overlay), '已暂停');
  assert.equal(p.game.input.enabled, false);
  const paused = p.snapshot();
  p.run(30000);
  p.click(375, 1158);
  p.drag([164.0625,574.0625], [248.4375,574.0625]);
  assert.equal(p.snapshot(), paused);
  assert.equal(p.game.time._active[0].elapsed, elapsed);
  p.click(375, 765);
  assert.equal(p.isActive(), true);
  assert.equal(p.game.input.enabled, true);
  assert.equal(p.snapshot(), paused);
  p.run(490);
  assert.equal(p.game.time._active[0].elapsed, 990);
  const money = p.text(170, 55);
  p.run(10);
  assert.equal(p.text(170, 55), money);
  for (let i = 0; i < 3; i++) {
    p.click(75, 55);
    p.run(5000);
    p.click(375, 765);
    assert.equal(p.game.time._active.length, 1);
    assert.equal(p.game.events.listenerCount('update'),2);
  }
});

test('胜负结算冻结游戏；连续重开清除单位、解锁、敌人、计时器和监听', () => {
  const counts = waveConfig.enemyCounts;
  const random = Math.random;
  try {
    const p = pve(true, 100);
    for (let round = 0; round < 4; round++) {
      assert.equal(p.text(170, 55), '$ 100');
      assert.equal(p.text(625, 55), '第 1 波');
      assert.equal(p.text(670.3125,938.5625), '♥♥♥');
      assert.equal(p.text(730, 1314), 'v' + GAME_VERSION);
      assert.equal(p.text(501.5625,658.4375), '锁');
      assert.equal(p.objects.get(p.game).filter(o => o.kind === 'text' && o.text.startsWith('Lv.')).length, 0);
      assert.equal(p.game.events.listenerCount('update'),2);
      assert.equal(p.globalEvents.listenerCount('blur'), 3);
      assert.equal(p.game.input.listenerCount('pointerdown'), 2);
      p.run(10);
      assert.equal(p.game.time._active.length, 1);
      const win = round % 2 === 0;
      // 当前 WaveProgress 持有配置对象，调整为一只漏怪验证胜利结算；失败沿用正式5波。
      waveConfig.enemyCounts = win ? [1] : counts;
      Math.random = () => 0.65;
      p.click(375, 1158);
      p.drag([183,1018], [501.5625,658.4375]);
      assert.equal(p.text(501.5625,658.4375), '+');
      Math.random = () => 0;
      p.click(375, 1158);
      p.drag([183,1018], [501.5625,658.4375]);
      p.run(30000);
      assert.equal(p.isActive(), false);
      assert.equal(p.text(375, 565, p.overlay), win ? '胜利' : '失败');
      if (win) assert.equal(p.text(375, 655, p.overlay), '乐：♥♥');
      assert.equal(p.text(375, 765, p.overlay), '再来一局');
      const ended = p.snapshot();
      p.run(10000);
      p.click(375, 1158);
      assert.equal(p.snapshot(), ended);
      const oldClock = p.game.time;
      p.click(375, 765);
      assert.equal(p.isActive(), true);
      assert.equal(p.startCount(), 1); // 重开直接走GameScene，未再次经过准备页。
      assert.equal(oldClock._active.length, 0);
      assert.equal(oldClock._pendingInsertion.length, 0);
    assert.ok(p.objects.get(p.game).filter(o => o.kind === 'graphics' && o.draws.some(d=>d[0]==='fillRoundedRect'))
      .every(o => o.draws.every(d=>d[0]==='fillRoundedRect')));
    }
  } finally { waveConfig.enemyCounts = counts; Math.random = random; }
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
  const scene = {
    events: new EventEmitter(), input: new EventEmitter(), game: { events: new EventEmitter() },
    add: { graphics() {
      const graphic = {
        x:0,y:0,setPosition(){return this;},setScale(){return this;},
        circle: false,
        clear() { this.circle = false; return this; },
        setDepth() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
        fillCircle(_x,_y,radius) { this.circle = true; this.radius=radius; return this; }, strokeCircle() { return this; },
      };
      graphics.push(graphic);
      return graphic;
    } },
  };
  const side = new PlayerSide('bottom', testMap);
  const board = side.board;
  board.tiles[0].unit = unit;
  const deployment = { draggedTile: null };
  let position = { kind: 'tile', index: 0 };
  new BattleController(scene, side, deployment,
    { positionAt: () => position }, () => {});
  const pointer = { id: 1, primaryDown: true, x: 187.5, y: 602.5 };
  const render = () => scene.events.emit('update', 0, 0);
  return { scene, deployment, pointer, render, range: graphics[0], setPosition: next => { position = next; } };
}

for (const event of ['pointerup', 'pointerupoutside']) {
  test(`按住显示，${event} 立即清除且下一帧不残留`, () => {
    const { scene, pointer, render, range } = setup();
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, true);
    scene.input.emit(event, pointer);
    assert.equal(range.circle, false);
    render();
    assert.equal(range.circle, false);
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

test('待放置栏、空格和其他区域均不显示范围', () => {
  const { scene, pointer, render, range, setPosition } = setup();
  for (const position of [{ kind: 'slot', index: 0 }, { kind: 'tile', index: 1 }, null]) {
    setPosition(position);
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, false);
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


test('上下静态棋盘使用同一正常透明度、填色与网格，中央分界线为克制的3px中性线',()=>{
 const p=pve(),objects=p.objects.get(p.game);
 const boardTiles=objects.filter(o=>o.kind==='rectangle'&&o.width===testMap.cellSize&&o.height===testMap.cellSize
   &&(o.color===0xd1b98f||o.color===0xe7e2d6));
 assert.equal(boardTiles.length,testMap.spaces.length*2);
 for(let i=0;i<testMap.spaces.length;i++){
  const upper=boardTiles[i],lower=boardTiles[i+testMap.spaces.length];
  assert.equal(upper.color,lower.color);assert.deepEqual(upper.stroke,lower.stroke);
  assert.equal(upper.alpha,undefined);assert.equal(lower.alpha,undefined);
 }
 const dividers=objects.filter(o=>o.kind==='graphics'&&o.draws.some(d=>d[0]==='lineStyle'&&d[1]===3&&d[2]===0x899184));
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


test('暂停重开取消保持冻结，确认复用完整重开并保留loadout，无重复循环',()=>{
 const random=Math.random;
 try {
  const p=pve(false, 100);p.click(375,885);p.click(155,630);p.click(375,815);p.click(375,1200);p.click(375,765);
  for(let round=0;round<3;round++){
   Math.random=()=>15.5/30;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
   Math.random=()=>16.5/30;p.click(375,1158);p.drag([183,1018],[248.4375,574.0625]);
   p.run(12000);p.click(75,55);const snapshot=p.snapshot(),clock=p.game.time;
   assert.equal(p.text(375,875,p.overlay),'重新开始');p.click(375,875);
   assert.equal(p.text(375,565,p.overlay),'确定重新开始？');assert.equal(p.text(375,655,p.overlay),'当前进度将丢失。');
   p.run(10000);p.click(375,765);assert.equal(p.isActive(),false);assert.equal(p.snapshot(),snapshot);
   p.click(220,765);assert.equal(p.text(375,565,p.overlay),'已暂停');p.run(10000);assert.equal(p.snapshot(),snapshot);
   p.click(375,875);p.click(530,765);assert.equal(p.isActive(),true);
   assert.equal(clock._active.length,0);assert.equal(clock._pendingInsertion.length,0);
   assert.equal(p.text(170,55),'$ 100');assert.equal(p.text(625,55),'第 1 波');assert.equal(p.text(670.3125,938.5625),'♥♥♥');
   assert.equal(p.text(120,1110),'农民');assert.equal(p.objects.get(p.game).some(o=>o.text==='Lv.1'||o.text==='Zz'||o.text==='小美'),false);
   assert.equal(p.game.events.listenerCount('update'),2);assert.equal(p.game.input.listenerCount('pointerdown'),2);
   p.run(1000);assert.equal(p.text(170,55),'$ 100');assert.equal(p.game.time._active.length,1);
  }
 }finally{Math.random=random;}
});


test('枪弓长按预览半径与实际索敌配置完全一致，松开清除',()=>{
 for(const [type,level,expected]of [['枪',1,150],['枪',5,150],['弓',1,187.5],['弓',2,225],['弓',5,225]]){
   const {scene,pointer,render,range}=setup({type,level});
   scene.input.emit('pointerdown',pointer);render();assert.equal(range.radius,expected);
   scene.input.emit('pointerup',pointer);assert.equal(range.circle,false);
 }
});


function farmerGame(){
 const p=pve(false);p.click(375,885);p.click(155,630);p.click(375,815);p.click(375,1200);p.click(375,765);
 return p;
}
const farmCash=p=>p.objects.get(p.game).filter(o=>o.kind==='text'&&/^\$[0-9]+$/.test(o.text)&&o.visible);
const farmMoney=p=>Number(p.text(170,55).slice(2));

test('农民生产/收益过期暂停冻结，领取不触发拖拽，重复点击/过期旧对象不加钱',()=>{
 const random=Math.random,speed=combatConfig.enemy.moveSpeed;
 try{
  combatConfig.enemy.moveSpeed=0;Math.random=()=>0.9;const p=farmerGame();
  p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);
  assert.ok(p.objects.get(p.game).some(o=>o.text==='农'));assert.equal(p.text(164.0625,552.6875),'');
  p.run(11990);p.click(75,55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);
  p.click(375,765);p.run(10);assert.equal(farmCash(p).length,1);
  const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===64&&o.height===28);
  const emit=()=>badge.emit('pointerdown',{},0,0,{stopPropagation(){}});
  p.click(75,55);const ready=p.snapshot(),money=farmMoney(p);p.run(10000);emit();assert.equal(farmMoney(p),money);assert.equal(p.snapshot(),ready);
  p.click(375,765);p.run(4990);assert.equal(farmCash(p).length,1);
  const before=farmMoney(p);let stopped=false;
  badge.emit('pointerdown',{},0,0,{stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.equal(farmMoney(p),before+1);emit();assert.equal(farmMoney(p),before+1);assert.equal(farmCash(p).length,0);
  p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.drag([164.0625,574.0625],[248.4375,574.0625]);assert.equal(farmCash(p)[0].x,248.4375);
  const prior=farmMoney(p);p.run(5000);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),prior); // 未领取的农民收益过期，不自动加钱。
  p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.drag([248.4375,574.0625],[183,1018]);assert.equal(farmCash(p).length,0);
  p.drag([183,1018],[248.4375,574.0625]);p.run(11990);assert.equal(farmCash(p).length,0);p.run(10);assert.equal(farmCash(p).length,1);
  p.click(75,55);p.click(375,875);p.click(530,765);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);
  emit();assert.equal(farmMoney(p),20);assert.equal(p.game.events.listenerCount('update'),2);assert.equal(p.text(120,1110),'农民');
  p.run(12000);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);assert.equal(p.game.time._active.length,1);
 }finally{Math.random=random;combatConfig.enemy.moveSpeed=speed;}
});
for(const win of [true,false])test('农民'+(win?'胜利':'失败')+'时收益冻结不可领取，再来一局清空并保留农民loadout',()=>{
 const random=Math.random,counts=waveConfig.enemyCounts;
 try{
  waveConfig.enemyCounts=win?[1]:counts;Math.random=()=>0.9;const p=farmerGame();
  p.click(375,1158);p.run(win?5000:9000);p.drag([183,1018],[164.0625,574.0625]);
  p.run(12000);
  const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===64&&o.height===28);
  p.run(5000);assert.equal(p.text(375,565,p.overlay),win?'胜利':'失败');
  const ended=p.snapshot(),money=farmMoney(p);p.run(30000);badge?.emit('pointerdown',{},0,0,{stopPropagation(){}});
  assert.equal(p.snapshot(),ended);assert.equal(farmMoney(p),money);
   p.click(375,765);assert.equal(farmCash(p).length,0);assert.equal(farmMoney(p),20);assert.equal(p.text(120,1110),'农民');
  p.click(375,1158);assert.ok(p.objects.get(p.game).some(o=>o.text==='农'));
  assert.equal(p.game.events.listenerCount('update'),2);
 }finally{Math.random=random;waveConfig.enemyCounts=counts;}
});


function equippedV56() {
 const p=pve(false, 100);p.click(375,885);
 for(const x of [155,300,445]){p.click(x,630);p.click(375,815);}
 p.click(375,1200);p.click(375,765);return p;
}
function dropUpgrade(p,x,y,eventType='pointerup') {
 p.click(80,1018);
 p.game.input.emit('pointermove',{id:1,x,y,primaryDown:true});
 p.game.input.emit(eventType,{id:1,x,y,primaryDown:false});
}
test('升级符真实输入：20秒CD、暂停冻结、非法释放/移出保留ready、合法拖放升级与互斥',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{
  combatConfig.enemy.moveSpeed=0;Math.random=()=>0;const p=equippedV56();
  assert.equal(p.text(80,1018),'升级符\n20s');assert.equal(p.text(120,1110),'农民');assert.equal(p.text(120,1186),'招贤榜');
  p.click(375,1158);dropUpgrade(p,183,1018);assert.equal(p.text(80,1018),'升级符\n20s');
  p.run(7000);assert.equal(p.text(80,1018),'升级符\n13s');p.click(75,55);const frozen=p.snapshot();p.run(30000);
  assert.equal(p.snapshot(),frozen);p.click(375,765);p.run(12990);assert.equal(p.text(80,1018),'升级符\n1s');p.run(10);
  assert.equal(p.text(80,1018),'升级符\n可用');dropUpgrade(p,375,50);assert.equal(p.text(80,1018),'升级符\n可用');
  dropUpgrade(p,183,1018,'pointerupoutside');assert.equal(p.text(80,1018),'升级符\n可用');
  p.click(80,1018);assert.equal(p.text(80,1018),'升级符\n拖动中');const money=farmMoney(p);p.click(375,1158);assert.equal(farmMoney(p),money);
  // 第二根手指不能在道具拖动时移动普通单位。
  p.game.input.emit('pointerdown',{id:2,x:183,y:1018,primaryDown:true});
  p.game.input.emit('pointermove',{id:2,x:164.0625,y:574.0625,primaryDown:true});
  p.game.input.emit('pointerup',{id:2,x:164.0625,y:574.0625,primaryDown:false});
  p.game.input.emit('pointerup',{id:1,x:183,y:1018,primaryDown:false});
  assert.equal(p.text(80,1018),'升级符\n20s');assert.equal(p.text(375,1264),'道具使用成功');
  assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.2'));
  p.run(20000);p.click(80,1018);p.click(75,55);assert.equal(p.text(80,1018),'升级符\n可用');
  p.run(1000);p.click(375,765);p.game.input.emit('pointerup',{id:1,x:279,y:1018});assert.equal(p.text(80,1018),'升级符\n可用');
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
test('回主页取消保持暂停；确认清理计时器/技能/农民收益/主动CD并保留装备，连续返回不重复循环',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{
  combatConfig.enemy.moveSpeed=0;const p=equippedV56();
  for(let round=0;round<3;round++){
   // 共享字小美与农民都部署，制造运行中的技能、生产与战斗。
   for(const [rng,to] of [[15.5/35,[164.0625,574.0625]],[17.5/35,[248.4375,574.0625]],[.99,[332.8125,574.0625]]]){
    Math.random=()=>rng;p.click(375,1158);p.drag([183,1018],to);
   }
   p.run(12000);assert.equal(farmCash(p).length,1);
   const badge=p.objects.get(p.game).findLast(o=>o.interactive===true&&o.width===64&&o.height===28),clock=p.game.time;
   p.click(75,55);assert.equal(p.text(375,985,p.overlay),'回到主页');p.click(375,985);
   assert.equal(p.text(375,565,p.overlay),'确定回到主页？');assert.equal(p.text(375,655,p.overlay),'当前对局进度将丢失。');
   const frozen=p.snapshot();p.run(30000);p.click(220,765);assert.equal(p.text(375,565,p.overlay),'已暂停');assert.equal(p.isActive(),false);
   p.run(10000);assert.equal(p.snapshot(),frozen);p.click(375,985);p.click(530,765);
   assert.equal(p.ready.startState,'READY');assert.equal(p.text(375,765,p.ready),'开始游戏');
   assert.equal(clock._active.length,0);assert.equal(clock._pendingInsertion.length,0);
   assert.equal(p.game.events.listenerCount('update'),0);assert.equal(p.game.events.listenerCount('resume'),0);assert.equal(p.game.input.listenerCount('pointerup'),0);assert.equal(p.globalEvents.listenerCount('blur'),0);
   assert.equal(farmCash(p).length,0);const homepage=p.snapshot();p.run(60000);assert.equal(p.snapshot(),homepage);
   p.click(375,885);assert.equal(p.text(125,410,p.items),'农民');p.click(375,1200);p.click(375,765);
   assert.equal(p.text(80,1018),'升级符\n20s');assert.equal(p.text(120,1110),'农民');assert.equal(p.text(120,1186),'招贤榜');
   assert.equal(farmMoney(p),100);badge.emit('pointerdown',{},0,0,{stopPropagation(){}});assert.equal(farmMoney(p),100);
   assert.equal(p.text(625,55),'第 1 波');assert.equal(p.text(670.3125,938.5625),'♥♥♥');
   assert.equal(p.objects.get(p.game).some(o=>o.text.startsWith('Lv.')),false);assert.equal(p.game.events.listenerCount('update'),2);
   p.run(1000);assert.equal(farmMoney(p),100);assert.equal(p.game.time._active.length,1);
  }
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
for(const win of [true,false])test('升级符在'+(win?'胜利':'失败')+'后停止CD且重开重新充能',()=>{
 const counts=waveConfig.enemyCounts;
 try{
  if(win)waveConfig.enemyCounts=[1];const p=equippedV56();p.run(60000);
  assert.equal(p.text(375,565,p.overlay),win?'胜利':'失败');const frozen=p.snapshot();p.run(30000);assert.equal(p.snapshot(),frozen);
  p.click(375,765);assert.equal(p.text(80,1018),'升级符\n20s');assert.equal(p.text(120,1186),'招贤榜');
  p.run(5000);p.click(75,55);p.click(375,875);p.click(530,765);assert.equal(p.text(80,1018),'升级符\n20s');
  assert.equal(p.game.events.listenerCount('update'),2);p.run(1000);assert.equal(farmMoney(p),100);
 }finally{waveConfig.enemyCounts=counts;}
});


function equippedV57(){const p=pve(false);p.click(375,885);
 for(const [x,y] of [[155,630],[590,630],[155,750]]){p.click(x,y);p.click(375,815);}
 p.click(375,1200);p.click(375,765);return p;
}
function dragActive(p,slot,x,y){p.click(slot,1018);p.game.input.emit('pointermove',{id:1,x,y,primaryDown:true});p.game.input.emit('pointerup',{id:1,x,y,primaryDown:false});}
test('v0.57两主动槽拖放：点金手无CD及时刷新钱，卖农民移除收益；如律令暂停冻结且失败不耗CD',()=>{
 const speed=combatConfig.enemy.moveSpeed,random=Math.random;
 try{combatConfig.enemy.moveSpeed=0;const p=equippedV57();
  assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(p.text(670,1018),'急急如\n律令\n20s');
  Math.random=()=>.99;p.click(375,1158);p.drag([183,1018],[164.0625,574.0625]);p.run(12000);assert.equal(farmCash(p).length,1);
  const money=farmMoney(p);dragActive(p,80,164.0625,574.0625);assert.equal(farmMoney(p),money+1);assert.equal(farmCash(p).length,0);
  dragActive(p,80,279,1018);assert.equal(farmMoney(p),money+2);assert.equal(p.text(80,1018),'点金手\n可用');
  p.click(75,55);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);p.click(375,765);p.run(12000);
  assert.equal(p.text(670,1018),'急急如\n律令\n可用');dragActive(p,670,375,1018);assert.equal(p.text(670,1018),'急急如\n律令\n可用'); // 农民非法
  Math.random=()=>0;p.click(375,1158);dragActive(p,670,183,1018);assert.equal(p.text(670,1018),'急急如\n律令\n20s');
  p.run(20000);dragActive(p,670,183,1018);assert.equal(p.text(670,1018),'急急如\n律令\n可用');
  p.drag([183,1018],[164.0625,574.0625]);dragActive(p,670,164.0625,574.0625);assert.equal(p.text(670,1018),'急急如\n律令\n可用');
   p.click(75,55);p.click(375,875);p.click(530,765);assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(farmMoney(p),20);
  p.click(75,55);p.click(375,985);p.click(530,765);assert.equal(p.game.events.listenerCount('update'),0);assert.equal(p.game.input.listenerCount('pointerup'),0);
   p.click(375,765);assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(p.text(80,1018),'点金手\n可用');assert.equal(farmMoney(p),20);
   assert.equal(p.game.events.listenerCount('update'),2);p.run(1000);assert.equal(farmMoney(p),20);assert.equal(p.game.time._active.length,1);
 }finally{combatConfig.enemy.moveSpeed=speed;Math.random=random;}
});
for(const win of [true,false])test('v0.57结算'+(win?'胜利':'失败')+'停止两道具，重开清空单位和强化',()=>{
 const counts=waveConfig.enemyCounts;
 try{if(win)waveConfig.enemyCounts=[1];const p=equippedV57();p.run(60000);assert.equal(p.text(375,565,p.overlay),win?'胜利':'失败');
 const snapshot=p.snapshot();p.run(30000);dragActive(p,80,183,1018);assert.equal(p.snapshot(),snapshot);
 p.click(375,765);assert.equal(farmMoney(p),20);assert.equal(p.text(670,1018),'急急如\n律令\n20s');assert.equal(p.text(80,1018),'点金手\n可用');
 assert.equal(p.objects.get(p.game).some(o=>o.text.startsWith('Lv.')),false);
 }finally{waveConfig.enemyCounts=counts;}
});


test('v0.571 每张背包卡片及详情均明确区分主动/被动',()=>{
 const p=pve(false);p.click(375,885);
 for(const [x,y,category] of [[155,630,'被动'],[300,630,'被动'],[445,630,'主动'],[590,630,'主动'],[155,750,'主动']]){
  assert.equal(p.text(x,y+30,p.items),category);p.click(x,y);
  assert.ok(p.objects.get(p.items).some(o=>o.visible&&o.text==='类型：'+category+'道具'));
  const shade=p.objects.get(p.items).findLast(o=>o.kind==='rectangle'&&o.width===750);shade.emit('pointerdown');
 }
});

test('没有被动不自动涨钱；铁饭碗只在装备局内每10秒发$2，暂停冻结，重开后重新计时',()=>{
 const plain=pve();plain.run(10000);assert.equal(plain.text(170,55),'$ 20');
 const p=pve(false);p.click(375,885);p.click(300,750);p.click(375,815);p.click(375,1200);p.click(375,765);
 assert.equal(p.text(170,55),'$ 20');p.run(9990);assert.equal(p.text(170,55),'$ 20');
 p.click(75,55);p.run(30000);assert.equal(p.text(170,55),'$ 20');
 p.click(375,765);p.run(10);assert.equal(p.text(170,55),'$ 22');
 p.run(4000);p.click(75,55);p.click(375,875);p.click(530,765);
 assert.equal(p.text(170,55),'$ 20');p.run(9990);assert.equal(p.text(170,55),'$ 20');
 p.run(10);assert.equal(p.text(170,55),'$ 22');
});

test('来财按钮展示当局实际价格，余额不足时不改变招募次数',()=>{
 const p=pve();assert.equal(p.text(170,55),'$ 20');assert.equal(p.text(375,1158),'来财 $10');
 p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
 p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
 p.run(2000);p.click(375,1158);assert.equal(p.text(170,55),'$ 10');assert.equal(p.text(375,1158),'来财 $12');
});

test('准备页使用单一灰色背景，保留开始和道具按钮',()=>{
 const p=pve(false),objects=p.objects.get(p.ready);
 const background=objects.find(o=>o.kind==='rectangle'&&o.width===750&&o.height===1334);
 assert.equal(background?.color,READY_BACKGROUND_COLOR);
 assert.equal(objects.filter(o=>o.kind==='graphics').length,0);
 assert.equal(p.text(375,765,p.ready),'开始游戏');
 assert.equal(p.text(375,885,p.ready),'道具');
 p.click(375,885);assert.equal(p.objects.has(p.items),true);
});
