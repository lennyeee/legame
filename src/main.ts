import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { PveOverlayScene } from './scenes/PveOverlayScene';
import { ReadyScene } from './scenes/ReadyScene';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f7f3e8',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 750,
    height: 1334,
  },
  scene: [ReadyScene, GameScene, PveOverlayScene],
});
