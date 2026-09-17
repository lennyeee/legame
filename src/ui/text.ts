import Phaser from 'phaser';

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 24,
  color = '#514a40',
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
    fontSize: `${size}px`,
    color,
  }).setOrigin(0.5);
}
