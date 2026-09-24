import { CanvasTexture, DoubleSide, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Material } from 'three';

/**
 * JAPANESE SIGNS: shop boards, vertical nobori banners and neon, drawn on
 * canvases in the system's Japanese font. Every distinct sign is ONE cached
 * material, shared by every mesh that shows it, so a city of signs costs a
 * handful of textures.
 */
export interface SignStyle {
  readonly bg: string;
  readonly fg: string;
  /** Vertical text (banners, hanging boards). */
  readonly vertical?: boolean;
  /** Neon: bright text on dark, unlit and a little glow. */
  readonly neon?: boolean;
  readonly border?: string;
}

const FONT = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Meiryo", "MS Gothic", sans-serif';

const cache = new Map<string, Material>();

const draw = (text: string, style: SignStyle): CanvasTexture => {
  const chars = [...text];
  const long = Math.max(1, chars.length);
  const canvas = document.createElement('canvas');
  const cell = 96;
  canvas.width = style.vertical ? cell + 24 : cell * long + 40;
  canvas.height = style.vertical ? cell * long + 40 : cell + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (style.border) {
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  }
  ctx.font = `900 ${cell * 0.78}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style.neon) {
    ctx.shadowColor = style.fg;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = style.fg;
  chars.forEach((ch, i) => {
    const x = style.vertical ? canvas.width / 2 : 20 + cell * (i + 0.5);
    const y = style.vertical ? 20 + cell * (i + 0.5) : canvas.height / 2;
    ctx.fillText(ch, x, y);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
};

export const signMaterial = (text: string, style: SignStyle): Material => {
  const key = `${text}|${style.bg}|${style.fg}|${style.vertical ? 1 : 0}|${style.neon ? 1 : 0}|${style.border ?? ''}`;
  let material = cache.get(key);
  if (!material) {
    material = new MeshBasicMaterial({ map: draw(text, style), side: DoubleSide, fog: !style.neon });
    cache.set(key, material);
  }
  return material;
};

/**
 * A sign mesh `size` world units along its text: tall for vertical text, wide
 * for horizontal. Faces +Z; the caller turns and places it.
 */
export const sign = (text: string, style: SignStyle, size: number): Mesh => {
  const n = Math.max(1, [...text].length);
  const across = size / (n + 0.4);
  const geometry = style.vertical ? new PlaneGeometry(across * 1.25, size) : new PlaneGeometry(size, across * 1.25);
  return new Mesh(geometry, signMaterial(text, style));
};

