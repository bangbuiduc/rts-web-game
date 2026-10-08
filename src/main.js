import Phaser from 'phaser';
import { MapScene } from './game/scenes/MapScene.js';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#18221b',
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: {
    mouse: { preventDefaultWheel: true },
  },
  scene: [MapScene],
});

window.addEventListener('beforeunload', () => game.destroy(true));
