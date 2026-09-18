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
const { GAME_VERSION } = await import('../src/config/game.ts');
const { heroCombat } = await import('../src/config/heroes.ts');
const { skillConfigs } = await import('../src/config/skills.ts');
const { default: Clock } = await import('../node_modules/phaser/src/time/Clock.js');

// 使用真实场景、控制器和 Phaser Clock；仅替代渲染对象及场景调度。
function pve(startImmediately = true) {
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
  function prepare(scene) {
    const list = [];
    objects.set(scene, list);
    const object = (kind, x = 0, y = 0, width = 0, height = 0) => {
      const target = Object.assign(new EventEmitter(), { kind, x, y, width, height, text: '', visible: true, draws: [] });
      let proxy;
      proxy = new Proxy(target, { get(t, key) {
        if (key in t) return t[key];
        if (key === 'setText') return value => { t.text = value; return proxy; };
        if (key === 'setVisible') return value => { t.visible = value; return proxy; };
        if (key === 'setInteractive') return () => { t.interactive = true; return proxy; };
        if (key === 'getBounds') return () => ({ contains: (px, py) => Math.abs(px-x) <= width/2 && Math.abs(py-y) <= height/2 });
        if (key === 'clear') return () => { t.draws = []; return proxy; };
        if (key === 'destroy') return () => { t.text = ''; t.visible = false; t.interactive = false; t.draws = []; return proxy; };
        if (key === 'fillCircle' || key === 'fillRect' || key === 'strokeRect' || key === 'lineBetween') return (...args) => { t.draws.push([key, ...args]); return proxy; };
        return () => proxy;
      } });
      list.push(proxy);
      return proxy;
    };
    scene.events ??= new EventEmitter();
    scene.input ??= new EventEmitter();
    scene.game = { events: globalEvents };
    scene.scale = { width: 750 };
    scene.add = Object.fromEntries(['rectangle', 'circle', 'triangle', 'graphics', 'container'].map(kind => [kind, (...args) => object(kind, ...args)]));
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
      game.create(data);
    },
  };
  items.scene = { start: (key,data) => {
    assert.equal(key,'ReadyScene');shutdown(items);itemsActive=false;readyActive=true;prepare(ready);ready.create(data);
  } };
  overlay.scene = {
    resume: () => { active = true; game.events.emit('resume'); },
    stop: key => { if (key === 'GameScene') shutdown(game); else { shutdown(overlay); overlayActive = false; } },
    start: (key,data) => { assert.equal(key, 'GameScene'); shutdown(overlay); overlayActive = false; prepare(game); active = true; game.create(data); },
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
  p.run(30000);assert.equal(p.objects.has(p.game),false);assert.equal(p.text(155,630,p.items),'农民');
  p.click(155,630);assert.equal(p.text(375,510,p.items),'农民');assert.equal(p.text(375,565,p.items),'被动道具');
  assert.equal(p.text(375,655,p.items),'携带后，征兵时有概率出现农民。部署后的农民不会攻击，会周期性生产美金。');
  const shade=p.objects.get(p.items).findLast(o=>o.kind==='rectangle'&&o.width===750);
  shade.emit('pointerdown');assert.equal(p.objects.get(p.items).some(o=>o.text==='装备'&&o.visible),false);
  p.click(155,630);p.click(375,815);assert.equal(p.text(125,410,p.items),'农民');
  p.click(155,630);assert.ok(p.objects.get(p.items).some(o=>o.text==='卸下'&&o.visible));p.click(375,815);
  assert.equal(p.text(125,410,p.items),'—');p.click(155,630);p.click(375,815);
  p.click(375,1200);assert.equal(p.ready.startState,'READY');p.click(375,885);
  assert.equal(p.text(125,410,p.items),'农民');p.click(375,1200);p.click(375,765);
  p.click(75,49);p.run(10000);assert.equal(p.text(160,1303),'农民');p.click(375,765);
  for(let round=0;round<3;round++){
    assert.equal(p.text(160,1303),'农民');assert.equal(p.text(590,1303),'—');
    for(const x of [90,660])assert.notEqual(p.objects.get(p.game).find(o=>o.kind==='rectangle'&&o.x===x&&o.y===1240).interactive,true);
    p.run(1000);assert.equal(p.text(155,109),'$ 101');
    p.run(60000);assert.equal(p.text(375,565,p.overlay),'失败');p.click(375,765);
    assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.text(580,117),'第 1 波');
  }
  const counts=waveConfig.enemyCounts;
  try {
    waveConfig.enemyCounts=[1];p.run(30000);assert.equal(p.text(375,565,p.overlay),'胜利');
    p.click(375,765);assert.equal(p.text(160,1303),'农民');
  } finally { waveConfig.enemyCounts=counts; }
});

test('未装备农民开局被动栏为空',()=>{
  const p=pve();assert.equal(p.text(160,1303),'—');assert.equal(p.objects.get(p.game).some(o=>o.text==='农民'),false);
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
  p.click(375,1240);p.click(75,49);p.drag([119,1092],[195,650]);
  assert.equal(p.snapshot(), before);
  assert.equal(p.objects.has(p.game), false);
  assert.equal(p.ready.events.listenerCount('update'), 0);
  assert.equal(p.ready.input.listenerCount('pointerdown'), 0);
  assert.equal(p.ready.time._active.length, 0);
  assert.equal(p.ready.time._pendingInsertion.length, 0);
  assert.equal(p.startCount(), 0);
});

test('开始后统一初始化一次，重复请求无效，资源/波次从点击时刻计时并恢复操作', () => {
  const p = pve(false);
  p.run(60000);
  p.click(375,765);
  for (let i=0;i<10;i++) p.ready.requestStartGame();
  assert.equal(p.ready.startState, 'RUNNING');
  assert.equal(p.isActive(), true);
  assert.equal(p.startCount(), 1);
  assert.equal(p.text(155,109), '$ 100');
  assert.equal(p.text(580,117), '第 1 波');
  assert.equal(p.game.events.listenerCount('update'), 1);
  p.run(990);assert.equal(p.text(155,109), '$ 100');
  p.run(10);assert.equal(p.text(155,109), '$ 101');
  assert.equal(p.game.time._active.length, 1);
  const enemyCircles = () => p.objects.get(p.game).filter(o=>o.kind==='graphics')
    .flatMap(o=>o.draws).filter(d=>d[0]==='fillCircle'&&d[3]===15);
  p.run(990);assert.equal(enemyCircles().length, 0);
  p.run(20);assert.equal(enemyCircles().length, 1);
  const random = Math.random;
  try { Math.random=()=>0;p.click(375,1240);p.drag([119,1092],[195,650]); }
  finally { Math.random=random; }
  assert.equal(p.text(155,109), '$ 92');
  assert.equal(p.text(195,650), '');
  p.click(75,49);assert.equal(p.text(375,565,p.overlay),'已暂停');
  p.click(375,765);assert.equal(p.isActive(),true);
});

test('双格视觉、休眠标识、拆开恢复、暂停、胜负及多次重开清理', () => {
  const random = Math.random;
  const counts = waveConfig.enemyCounts;
  const damage = heroCombat.damage;
  const skillDamage = skillConfigs.xiaomei_barrage.damage;
  try {
    const p = pve();
    for (const win of [false, true, false]) {
      heroCombat.damage = win ? damage : 1;
      skillConfigs.xiaomei_barrage.damage = win ? skillDamage : 1;
      waveConfig.enemyCounts = win ? [1] : counts;
      Math.random = () => 15.5 / 20;
      p.click(375, 1240);
      p.drag([119, 1092], [195, 650]);
      assert.equal(p.text(195, 631), 'Zz');
      assert.equal(p.objects.get(p.game).filter(o => o.text === 'Zz').length, 1);
      Math.random = () => 16.5 / 20;
      p.click(375, 1240);
      p.drag([119, 1092], [247, 650]);
      assert.equal(p.text(195, 631), '');
      assert.equal(p.text(247, 631), '');
      assert.equal(p.objects.get(p.game).some(o => o.text === '小美'), false);
      const boxes = p.objects.get(p.game).filter(o => o.kind === 'rectangle' && o.y === 650 && [195,247].includes(o.x));
      assert.ok(boxes.every(o => !o.visible));
      const linkedBorder = () => p.objects.get(p.game).some(o => o.kind === 'graphics'
        && o.draws.some(d => d[0] === 'strokeRect' && d[3] === 104 && d[4] === 52));
      assert.equal(linkedBorder(), true);
      const pointer = { id: 1, x: 247, y: 650, primaryDown: true };
      p.game.input.emit('pointerdown', pointer);
      p.run(10);
      const range = p.objects.get(p.game).filter(o => o.kind === 'graphics').at(-2);
      assert.ok(range.draws.some(d => d[0] === 'fillCircle' && d[1] === 221));
      p.game.input.emit('pointermove', { ...pointer, x: 270 });
      assert.equal(linkedBorder(), false);
      assert.equal(p.text(195, 631), 'Zz');
      assert.equal(range.draws.length, 0);
      p.game.input.emit('pointerup', { ...pointer, x: 0, y: 0, primaryDown: false });
      assert.equal(linkedBorder(), true);
      // 收回字、反序交换、再放回都立即刷新边框及休眠状态。
      p.drag([247,650],[119,1092]);
      assert.equal(linkedBorder(),false);
      p.drag([119,1092],[247,650]);
      p.drag([195,650],[247,650]);
      assert.equal(linkedBorder(),false);
      p.drag([195,650],[247,650]);
      assert.equal(linkedBorder(),true);
      p.run(2100);
      p.click(75,49);
      const paused=p.snapshot();
      p.run(5000);p.drag([247,650],[119,1092]);
      assert.equal(p.snapshot(),paused);
      p.click(375,765);p.run(90000);
      assert.equal(p.text(375,565,p.overlay),win?'胜利':'失败');
      const ended=p.snapshot();p.run(5000);p.drag([247,650],[119,1092]);
      assert.equal(p.snapshot(),ended);
      p.click(375,765);
      assert.equal(linkedBorder(),false);
      assert.equal(p.objects.get(p.game).some(o => ['小','美','Zz'].includes(o.text)),false);
      assert.equal(p.game.events.listenerCount('update'),1);
      p.run(2000);
      assert.equal(p.objects.get(p.game).some(o=>o.kind==='graphics'&&o.draws.some(d=>d[0]==='lineBetween')),false);
      // 恢复下一轮初始计时，确保新一局重复测试也完全走关闭/创建流程。
      p.run(30000);p.click(375,765);
    }
  } finally { Math.random=random;waveConfig.enemyCounts=counts;heroCombat.damage=damage;skillConfigs.xiaomei_barrage.damage=skillDamage; }
});

test('EXP条随参战击杀更新，暂停冻结，同字升级清零，拆开/重开清理', () => {
  const random = Math.random;
  try {
    const p = pve();
    Math.random = () => 15.5 / 20;p.click(375,1240);p.drag([119,1092],[195,650]);
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
    Math.random = () => 16.5 / 20;p.click(375,1240);p.drag([119,1092],[247,650]);
    p.run(4500);
    assert.equal(p.text(221,665),'Lv.1');
    const expBars = () => p.objects.get(p.game).filter(o=>o.kind==='graphics')
      .flatMap(o=>o.draws).filter(d=>d[0]==='fillRect'&&d[1]===175&&d[2]===671&&d[4]===3);
    assert.ok(expBars().some(d=>Math.abs(d[3]-92/3)<0.001));
    p.click(75,49);const paused=p.snapshot();p.run(10000);p.drag([247,1092],[247,650]);
    assert.equal(p.snapshot(),paused);p.click(375,765);
    Math.random = () => 15.5 / 20;p.click(375,1240);p.drag([119,1092],[195,650]);p.run(10);
    assert.equal(p.text(221,665),'Lv.2');assert.ok(expBars().some(d=>d[3]===0));
    p.drag([247,650],[119,1092]);p.run(10);
    assert.equal(expBars().length,0);assert.equal(p.text(195,631),'Zz');
    assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.2'));
    p.run(30000);const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,765);assert.equal(expBars().length,0);
    assert.equal(p.objects.get(p.game).some(o=>o.text==='Lv.2'),false);
    Math.random=()=>15.5/20;p.click(375,1240);assert.ok(p.objects.get(p.game).some(o=>o.text==='Lv.1'));
  } finally { Math.random=random; }
});

test('小美名字闪烁由技能发动触发，暂停冻结CD和释放中伤害，重开清理闪烁', () => {
  const random=Math.random;
  try {
    const p=pve();
    Math.random=()=>15.5/20;p.click(375,1240);p.drag([119,1092],[195,650]);
    Math.random=()=>16.5/20;p.click(375,1240);p.drag([119,1092],[247,650]);
    const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text==='小美'&&o.visible);
    p.run(9500);assert.equal(flashes().length,0);
    p.click(75,49);const paused=p.snapshot();p.run(30000);assert.equal(p.snapshot(),paused);
    p.click(375,765);p.run(490);assert.equal(flashes().length,0);
    p.run(20);assert.equal(flashes().length,1);
    p.click(75,49);const casting=p.snapshot();p.run(5000);assert.equal(p.snapshot(),casting);
    p.click(375,765);p.run(500);assert.equal(flashes().length,0);
    p.drag([247,650],[119,1092]);p.run(30000);
    assert.equal(p.text(375,565,p.overlay),'失败');const ended=p.snapshot();p.run(10000);assert.equal(p.snapshot(),ended);
    p.click(375,765);assert.equal(flashes().length,0);p.run(10000);assert.equal(flashes().length,0);
  } finally { Math.random=random; }
});

for (const [name,left,right,cd] of [['阿饼',17.5,18.5,14000],['小六',15.5,19.5,12000]]) {
  test(`${name}技能事件闪烁、充能及发动后暂停冻结、拆开结算和重开清理`, () => {
    const random=Math.random;
    try {
      const p=pve();
      Math.random=()=>left/20;p.click(375,1240);p.drag([119,1092],[195,650]);
      Math.random=()=>right/20;p.click(375,1240);p.drag([119,1092],[247,650]);
      const flashes=()=>p.objects.get(p.game).filter(o=>o.kind==='text'&&o.text===name&&o.visible);
      // 观察真实成长后的首次发动，不假定击杀升级前后的CD完全相同。
      p.run(1000);p.click(75,49);const paused=p.snapshot();
      p.run(30000);p.drag([247,650],[119,1092]);assert.equal(p.snapshot(),paused);
      p.click(375,765);
      let seen=false;
      for(let ms=0;ms<cd&&!seen;ms+=10){p.run(10);seen=flashes().length>0;}
      assert.equal(seen,true);
      p.click(75,49);const casting=p.snapshot();p.run(20000);assert.equal(p.snapshot(),casting);
      p.click(375,765);p.drag([247,650],[119,1092]);p.run(10);assert.equal(flashes().length,0);
      p.run(60000);assert.equal(p.text(375,565,p.overlay),'失败');
      const ended=p.snapshot();p.run(20000);assert.equal(p.snapshot(),ended);
      p.click(375,765);p.run(1000);assert.equal(flashes().length,0);
      assert.equal(p.game.events.listenerCount('update'),1);assert.equal(p.game.time._active.length,1);
      assert.equal(p.objects.get(p.game).some(o=>o.text===name||o.text==='Zz'),false);
    } finally { Math.random=random; }
  });
}

test('PVE暂停冻结敌人、攻击、出兵与真实收入计时器；禁止操作并原位恢复', () => {
  const p = pve();
  const random = Math.random;
  try {
    Math.random = () => 0.35; // 固定征到弓，保证暂停前已有自动攻击。
    p.click(375, 1240);
  } finally { Math.random = random; }
  p.drag([119, 1092], [195, 650]);
  p.run(2500);
  const elapsed = p.game.time._active[0].elapsed;
  p.click(75, 49);
  assert.equal(p.text(375, 565, p.overlay), '已暂停');
  assert.equal(p.game.input.enabled, false);
  const paused = p.snapshot();
  p.run(30000);
  p.click(375, 1240);
  p.drag([195, 650], [247, 650]);
  assert.equal(p.snapshot(), paused);
  assert.equal(p.game.time._active[0].elapsed, elapsed);
  p.click(375, 765);
  assert.equal(p.isActive(), true);
  assert.equal(p.game.input.enabled, true);
  assert.equal(p.snapshot(), paused);
  p.run(490);
  assert.equal(p.game.time._active[0].elapsed, 990);
  const money = p.text(155, 109);
  p.run(10);
  assert.notEqual(p.text(155, 109), money);
  for (let i = 0; i < 3; i++) {
    p.click(75, 49);
    p.run(5000);
    p.click(375, 765);
    assert.equal(p.game.time._active.length, 1);
    assert.equal(p.game.events.listenerCount('update'), 1);
  }
});

test('胜负结算冻结游戏；连续重开清除单位、解锁、敌人、计时器和监听', () => {
  const counts = waveConfig.enemyCounts;
  const random = Math.random;
  try {
    const p = pve();
    for (let round = 0; round < 4; round++) {
      assert.equal(p.text(155, 109), '$ 100');
      assert.equal(p.text(580, 117), '第 1 波');
      assert.equal(p.text(645, 945), '♥♥♥');
      assert.equal(p.text(730, 1314), 'v' + GAME_VERSION);
      assert.equal(p.text(517, 735), '锁');
      assert.equal(p.objects.get(p.game).filter(o => o.kind === 'text' && o.text.startsWith('Lv.')).length, 0);
      assert.equal(p.game.events.listenerCount('update'), 1);
      assert.equal(p.globalEvents.listenerCount('blur'), 2);
      assert.equal(p.game.input.listenerCount('pointerdown'), 2);
      p.run(10);
      assert.equal(p.game.time._active.length, 1);
      const win = round % 2 === 0;
      // 当前 WaveProgress 持有配置对象，调整为一只漏怪验证胜利结算；失败沿用正式5波。
      waveConfig.enemyCounts = win ? [1] : counts;
      Math.random = () => 0.65;
      p.click(375, 1240);
      p.drag([119, 1092], [517, 735]);
      assert.equal(p.text(517, 735), '+');
      Math.random = () => 0;
      p.click(375, 1240);
      p.drag([119, 1092], [517, 735]);
      p.run(30000);
      assert.equal(p.isActive(), false);
      assert.equal(p.text(375, 565, p.overlay), win ? '胜利' : '失败');
      if (win) assert.equal(p.text(375, 655, p.overlay), '乐：♥♥');
      assert.equal(p.text(375, 765, p.overlay), '再来一局');
      const ended = p.snapshot();
      p.run(10000);
      p.click(375, 1240);
      assert.equal(p.snapshot(), ended);
      const oldClock = p.game.time;
      p.click(375, 765);
      assert.equal(p.isActive(), true);
      assert.equal(p.startCount(), 1); // 重开直接走GameScene，未再次经过准备页。
      assert.equal(oldClock._active.length, 0);
      assert.equal(oldClock._pendingInsertion.length, 0);
      assert.ok(p.objects.get(p.game).filter(o => o.kind === 'graphics').every(o => o.draws.length === 0));
    }
  } finally { waveConfig.enemyCounts = counts; Math.random = random; }
});

test('上方入口右下、终点左上，路径和格子统一计算且不改变基础地图', () => {
  const before = structuredClone(testMap);
  const upper = getBattlefieldLayout(testMap, 750, true);
  assert.deepEqual(upper.path[0], { x: 645, y: 545 });
  assert.deepEqual(upper.path.at(-1), { x: 105, y: 275 });
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

function setup() {
  const graphics = [];
  const scene = {
    events: new EventEmitter(), input: new EventEmitter(), game: { events: new EventEmitter() },
    add: { graphics() {
      const graphic = {
        circle: false,
        clear() { this.circle = false; return this; },
        setDepth() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
        fillCircle() { this.circle = true; return this; }, strokeCircle() { return this; },
      };
      graphics.push(graphic);
      return graphic;
    } },
  };
  const board = createBoardState(testMap);
  board.tiles[0].unit = { type: '刀', level: 1 };
  const deployment = { draggedTile: null };
  let position = { kind: 'tile', index: 0 };
  new BattleController(scene, testMap, board, { money: 100 }, deployment,
    { positionAt: () => position }, () => {});
  const pointer = { id: 1, primaryDown: true, x: 195, y: 650 };
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
