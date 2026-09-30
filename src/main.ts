import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { PveOverlayScene } from './scenes/PveOverlayScene';
import { ReadyScene } from './scenes/ReadyScene';
import { ItemsScene } from './scenes/ItemsScene';
import { MatchingScene } from './scenes/MatchingScene';
import { ResultScene } from './scenes/ResultScene';
import { ShopScene } from './scenes/ShopScene';
import { HeroEncyclopediaScene } from './scenes/HeroEncyclopediaScene';
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
  scene: [ReadyScene, MatchingScene, GameScene, PveOverlayScene, ItemsScene, ResultScene, ShopScene, HeroEncyclopediaScene],
});
