import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { createAnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { createCharacterBody } from '../anime/CharacterModels.js';

const SIZE = 192;

/**
 * PORTRAITS OF THE REAL MODELS for the menus: each character rendered
 * once, on demand, through the game's own renderer into a small offscreen
 * target and kept as an image URL. The menus show exactly what walks around
 * the world, with no image files shipped for any of it.
 */
export class ModelPortraits {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private readonly target = new WebGLRenderTarget(SIZE, SIZE);
  private readonly cache = new Map<string, string>();
  private readonly holder = new Group();

  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.scene.add(new HemisphereLight(0xffffff, 0xd8c8b0, 1.4));
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const key = new DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    this.scene.add(this.holder);
  }

  /** A character, waist up, turned a little toward the viewer. */
  character(slot: number): string {
    return this.get(`character:${slot}`, () => {
      const body = createCharacterBody(slot);
      const visual = new Group();
      visual.add(body.model);
      visual.scale.setScalar(body.scale);
      const animator = new PlayerAnimator(new PlayerRig(body.model, body.model), visual);
      const input = createAnimationInput();
      for (let i = 0; i < 12; i += 1) animator.update(0.1, input);
      visual.rotation.y = -0.3;
      this.camera.position.set(0, 2.6 * body.scale, 6.4 * body.scale);
      this.camera.lookAt(0, 2.25 * body.scale, 0);
      return visual;
    });
  }

  private get(key: string, build: () => Object3D): string {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    let url = '';
    try {
      const object = build();
      this.holder.add(object);
      this.camera.aspect = 1;
      this.camera.updateProjectionMatrix();
      const previousTarget = this.renderer.getRenderTarget();
      const previousColor = new Color();
      this.renderer.getClearColor(previousColor);
      const previousAlpha = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, pixels);
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.holder.remove(object);

      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const image = ctx.createImageData(SIZE, SIZE);
      // The target is bottom-up; the canvas is top-down.
      for (let y = 0; y < SIZE; y += 1) {
        image.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      }
      ctx.putImageData(image, 0, 0);
      url = canvas.toDataURL('image/png');
    } catch {
      url = '';
    }
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    this.target.dispose();
    this.cache.clear();
  }
}
