import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    this.add.text(this.scale.width / 2, this.scale.height / 2, '乐 GAME · MVP', {
      fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
      fontSize: '48px',
      color: '#514a40',
    }).setOrigin(0.5);
  }
}
