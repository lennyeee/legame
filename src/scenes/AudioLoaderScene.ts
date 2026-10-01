import Phaser from 'phaser';
import { audioForScene, loadAudioInBackground } from '../audio/AudioManager';

// No display or input. Remains active while normal Scenes come and go.
export class AudioLoaderScene extends Phaser.Scene {
  constructor() { super('AudioLoaderScene'); }

  create(): void {
    loadAudioInBackground(this, audioForScene(this));
  }
}
