import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { cellField } from './japan/Surfaces.js';

/**
 * The lava and the treadmill belt, drawn at runtime on canvases and cached.
 * Every other surface lives in `japan/Surfaces.ts`.
 */
export class WorldTextures {
  private readonly cache = new Map<string, Texture>();

  /**
   * THE LAVA, in the world's clean material style: broad cells of molten
   * colour with a hot glow at their cores, parted by thin dark cracks. Few,
   * big shapes, so it reads as lava from any distance and never looks noisy.
   * The material scrolls it.
   */
  lava(base: string, hot: string, crust: string): Texture {
    return this.cached(`lava:${base}:${hot}:${crust}`, () => {
      const size = 256;
      const ctx = context(size);
      const field = cellField(size, 4, 4, 0.8, seeded(0x1a7a));
      const b = rgb(base);
      const h = rgb(hot);
      const c = rgb(crust);
      const image = ctx.createImageData(size, size);
      for (let i = 0; i < size * size; i += 1) {
        // Hot at a cell's heart, the base colour toward its rim.
        const t = smoothstep(4, 30, field.near[i]!);
        let r = h[0] + (b[0] - h[0]) * t;
        let g = h[1] + (b[1] - h[1]) * t;
        let bl = h[2] + (b[2] - h[2]) * t;
        // The crack: a thin dark seam with a soft shoulder.
        const k = 0.85 * (1 - smoothstep(1.2, 3, field.edge[i]!));
        r += (c[0] - r) * k;
        g += (c[1] - g) * k;
        bl += (c[2] - bl) * k;
        const o = i * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = bl;
        image.data[o + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      return ctx.canvas;
    });
  }

  /** TREADMILL BELT: chevrons on dark rubber. The material scrolls it. */
  belt(base: string, mark: string): Texture {
    return this.cached(`belt:${base}:${mark}`, () => {
      const size = 128;
      const ctx = context(size);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = mark;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 9;
      for (let i = -size; i < size * 2; i += 34) {
        ctx.beginPath();
        ctx.moveTo(i, size);
        ctx.lineTo(i + size / 2, size / 2);
        ctx.lineTo(i, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, size, 5);
      ctx.fillRect(0, size - 5, size, 5);
      return ctx.canvas;
    });
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }

  private cached(key: string, draw: () => HTMLCanvasElement, repeat = true): Texture {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const texture = new CanvasTexture(draw());
    texture.colorSpace = SRGBColorSpace;
    if (repeat) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.cache.set(key, texture);
    return texture;
  }
}

/** The one texture set the whole world shares, so a stud is the same stud everywhere. */
export const worldTextures = new WorldTextures();

const context = (size: number): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
};

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG, so every client draws exactly the same world. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
