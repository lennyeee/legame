import Phaser from 'phaser';
import { rankProgress, rankTitle, type RankChange } from '../progression/rank';
import { label } from './text';

// 只读快照驱动临时表现；不依赖PlayerSave/Match，不写永久状态。
export function showRankFeedback(scene: Phaser.Scene, change: RankChange): void {
  const before = change.beforeRank, after = change.afterRank;
  let valid = true;
  const temporary: Phaser.GameObjects.GameObject[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const title = label(scene, 375, 810, rankTitle(before), 30);
  const progress = label(scene, 375, 875, before.kind === 'points' ? rankProgress(before) : '', 30, '#b58a36');
  const stars = before.kind === 'stars' ? Array.from({ length: 5 }, (_, index) => label(scene, 275 + index * 50, 875, index < before.stars ? '★' : '☆', 38, '#b58a36')) : [];
  label(scene, 375, 970, change.promoted ? '晋升！' : change.demoted ? '降级' : change.delta === 0 ? '段位不变' : `${change.delta > 0 ? '+' : ''}${change.delta}${before.kind === 'stars' ? ' ★' : '分'}`, 28);
  const animate = (config: Phaser.Types.Tweens.TweenBuilderConfig): void => { tweens.push(scene.tweens.add(config)); };
  const finish = (): void => {
    if (!valid) return;
    temporary.splice(0).forEach(object => object.destroy());
    title.setText(rankTitle(after)); progress.setText(after.kind === 'points' ? rankProgress(after) : '');
    stars.forEach((star, index) => star.setText(after.kind === 'stars' ? index < after.stars ? '★' : '☆' : ''));
    if (after.kind === 'stars' && !stars.length) progress.setText(rankProgress(after));
    if (change.promoted || change.demoted) animate({ targets: title, scale: 1.1, alpha: 0.8, y: change.demoted ? 816 : 810, duration: 160, yoyo: true });
    else animate({ targets: stars.length ? stars : progress, scale: 1.08, duration: 120, yoyo: true });
  };
  if (change.delta === 0) finish();
  else if (before.kind === 'points' && after.kind === 'points') {
    const counter = { value: before.points };
    animate({ targets: counter, value: after.points, duration: 650,
      onUpdate: () => { if (valid) progress.setText(`${Math.round(counter.value)}分`); }, onComplete: finish });
  } else if (change.delta > 0) {
    const index = before.kind === 'stars' ? Math.min(4, before.stars) : 4;
    const star = label(scene, 275 + index * 50, 740, '★', 38, '#d3a034').setScale(2); temporary.push(star);
    animate({ targets: star, y: 875, scale: 1, duration: 600, ease: 'Back.Out', onComplete: finish });
  } else {
    const index = before.kind === 'stars' ? Math.max(0, before.stars - 1) : 4;
    const x = 275 + index * 50;
    const star = label(scene, x, 875, '★', 38, '#b58a36'); temporary.push(star);
    if (stars[index]) stars[index]!.setVisible(false);
    animate({ targets: star, scale: 1.5, duration: 180, yoyo: true, onComplete: () => {
      if (!valid) return; star.setVisible(false);
      stars[index]?.setVisible(true);
      for (const direction of [-1, 1]) {
        const piece = scene.add.triangle(x, 875, -12, -10, 12, -10, 0, 16, 0xb58a36); temporary.push(piece);
        animate({ targets: piece, x: x + direction * 70, y: 915, angle: direction * 75, alpha: 0, duration: 350,
          onComplete: direction === 1 ? finish : undefined });
      }
    } });
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    valid = false; tweens.forEach(tween => { tween.stop(); tween.remove(); }); temporary.forEach(object => object.destroy());
  });
}
