import { stageAt } from '@anime/shared';
import { Color, type Fog } from 'three';
import type { SceneManager } from '../../rendering/SceneManager.js';
import type { Sky } from '../Sky.js';
import type { Backdrop } from './Backdrop.js';
import { HUB_THEME, themeOfStage, type Atmosphere as Air, type Theme } from './Themes.js';

const RATE = 1.6;

/**
 * THE DISTRICT'S AIR: sky, clouds, fog, sunlight and horizon ease from one
 * district's mood to the next as the runner crosses into it - bright shrine
 * morning, city afternoon, rooftop sunset, bamboo green, snowy glare, festival
 * twilight - rather than snapping at a stage line.
 */
export class Atmosphere {
  private readonly now = {
    skyTop: new Color(),
    sky: new Color(),
    fog: new Color(),
    sun: new Color(),
    hemiSky: new Color(),
    hemiGround: new Color(),
    cloud: new Color(),
    cloudShade: new Color(),
    sunIntensity: 0,
    hemiIntensity: 0,
    ambient: 0,
    fogNear: 0,
    fogFar: 0,
  };
  private readonly target = new Color();
  private theme: Theme = HUB_THEME;
  private initialised = false;

  constructor(
    private readonly scene: SceneManager,
    private readonly sky: Sky,
    private readonly backdrop: Backdrop,
  ) {}

  get current(): Theme {
    return this.theme;
  }

  update(delta: number, z: number): void {
    const stage = stageAt(z);
    this.theme = stage > 0 ? themeOfStage(stage) : HUB_THEME;
    const air = this.theme.atmosphere;
    const k = this.initialised ? 1 - Math.exp(-RATE * delta) : 1;
    this.initialised = true;
    this.ease(k, air);
    const n = this.now;
    this.sky.setColors(n.skyTop, n.sky, n.fog, n.cloud, n.cloudShade);
    const fog = this.scene.scene.fog as Fog;
    fog.color.copy(n.fog);
    fog.near = n.fogNear;
    fog.far = n.fogFar;
    this.scene.setBackground(n.fog.getHex());
    this.scene.sun.color.copy(n.sun);
    this.scene.sun.intensity = n.sunIntensity;
    this.scene.hemi.color.copy(n.hemiSky);
    this.scene.hemi.groundColor.copy(n.hemiGround);
    this.scene.hemi.intensity = n.hemiIntensity;
    this.scene.ambient.intensity = n.ambient;
    this.backdrop.show(this.theme.backdrop);
    this.backdrop.tint(n.fog, Math.min(1, 0.35 + n.sunIntensity * 0.3));
  }

  private ease(k: number, air: Air): void {
    const n = this.now;
    const color = (into: Color, hex: number): void => {
      into.lerp(this.target.setHex(hex), k);
    };
    color(n.skyTop, air.skyTop);
    color(n.sky, air.sky);
    color(n.fog, air.fog);
    color(n.sun, air.sun);
    color(n.hemiSky, air.hemiSky);
    color(n.hemiGround, air.hemiGround);
    color(n.cloud, air.cloud);
    color(n.cloudShade, air.cloudShade);
    n.sunIntensity += (air.sunIntensity - n.sunIntensity) * k;
    n.hemiIntensity += (air.hemiIntensity - n.hemiIntensity) * k;
    n.ambient += (air.ambient - n.ambient) * k;
    n.fogNear += (air.fogNear - n.fogNear) * k;
    n.fogFar += (air.fogFar - n.fogFar) * k;
  }
}
