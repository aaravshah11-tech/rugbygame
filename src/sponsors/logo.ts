import * as THREE from 'three';
import { SPONSOR_BY_ID, type Sponsor } from '../data/sponsors';
import { SI_ICONS } from './icons';

/**
 * Brand logos drawn to canvas: the simple-icons mark (plus the name beside symbol-only marks), or
 * a wordmark in the brand's own colours, or the user's own file from public/sponsors/<id>.svg|.png.
 * Logos keep their proportions and get safe space around them; on dark panels the light version is
 * used, on light panels the dark one.
 */
export type LogoVariant = 'onDark' | 'onLight' | 'brand';

const lum = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/** The colour the logo is drawn in for a variant. */
export function logoColor(s: Sponsor, v: LogoVariant): string {
  if (v === 'brand') return s.colors.primary;
  if (v === 'onDark') return lum(s.colors.primary) > 0.32 ? s.colors.primary : '#ffffff';
  return lum(s.colors.primary) < 0.55 ? s.colors.primary : lum(s.colors.secondary) < 0.55 ? s.colors.secondary : '#111111';
}

// ---------------------------------------------------------------- user override files
// public/sponsors/<id>.svg or <id>.png replaces the built-in logo. Each id is tried once.
const overrides = new Map<string, HTMLImageElement | null>();
const listeners = new Map<string, (() => void)[]>();
export function loadOverride(id: string, onLoad?: () => void) {
  if (onLoad) listeners.set(id, [...(listeners.get(id) ?? []), onLoad]);
  if (overrides.has(id) || typeof Image === 'undefined') return;
  overrides.set(id, null);
  const tryExt = (exts: string[]) => {
    if (!exts.length) return;
    const img = new Image();
    img.onload = () => {
      overrides.set(id, img);
      for (const cb of listeners.get(id) ?? []) cb();
    };
    img.onerror = () => tryExt(exts.slice(1));
    img.src = `${import.meta.env.BASE_URL}sponsors/${id}.${exts[0]}`;
  };
  tryExt(['svg', 'png']);
}

// ---------------------------------------------------------------- drawing
/**
 * Draw a logo centred in the box (x, y, w, h) on an existing 2D context, keeping its aspect ratio
 * and leaving `pad` (fraction of the box height) of safe space.
 */
export function drawLogo(g: CanvasRenderingContext2D, s: Sponsor, v: LogoVariant, x: number, y: number, w: number, h: number, pad = 0.16) {
  const col = logoColor(s, v);
  const ix = x + h * pad;
  const iy = y + h * pad;
  const iw = w - 2 * h * pad;
  const ih = h - 2 * h * pad;
  const ov = overrides.get(s.id);
  if (ov) {
    const k = Math.min(iw / ov.width, ih / ov.height);
    const dw = ov.width * k;
    const dh = ov.height * k;
    g.drawImage(ov, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    return;
  }
  const icon = s.icon ? SI_ICONS[s.icon] : undefined;
  const wm = s.wordmark;
  const text = wm?.text ?? s.name;
  const font = (px: number) => `${wm?.italic ? 'italic ' : ''}${wm?.weight ?? 800} ${px}px ${wm?.font ?? '"Helvetica Neue", Arial, sans-serif'}`;
  g.save();
  g.fillStyle = col;
  g.textBaseline = 'middle';
  if (icon) {
    const p = new Path2D(icon.path);
    const b = iconBox(icon.path);
    const showName = !!s.withName;
    // icon height: the whole box, or ~80% when a name sits beside it
    const iconH = ih * (showName ? 0.82 : 1);
    let k = iconH / b.h;
    let iconW = b.w * k;
    let nameW = 0;
    let fontPx = ih * 0.58;
    if (showName) {
      g.font = font(fontPx);
      if (wm?.tracking) (g as unknown as { letterSpacing: string }).letterSpacing = `${wm.tracking * fontPx}px`;
      nameW = g.measureText(text).width;
    }
    const gap = showName ? ih * 0.22 : 0;
    const total = iconW + gap + nameW;
    if (total > iw) {
      const f = iw / total;
      k *= f;
      iconW *= f;
      nameW *= f;
      fontPx *= f;
    }
    const sx = ix + (iw - (iconW + gap * (total > iw ? iw / total : 1) + nameW)) / 2;
    g.save();
    g.translate(sx - b.x * k, iy + (ih - b.h * k) / 2 - b.y * k);
    g.scale(k, k);
    g.fill(p);
    g.restore();
    if (showName) {
      g.font = font(fontPx);
      g.textAlign = 'left';
      g.fillText(text, sx + iconW + gap * (total > iw ? iw / total : 1), iy + ih / 2 + fontPx * 0.04);
    }
  } else {
    // wordmark: as big as fits
    let px = ih * 0.78;
    g.font = font(px);
    if (wm?.tracking) (g as unknown as { letterSpacing: string }).letterSpacing = `${wm.tracking * px}px`;
    const tw = g.measureText(text).width;
    if (tw > iw) {
      px *= iw / tw;
      g.font = font(px);
      if (wm?.tracking) (g as unknown as { letterSpacing: string }).letterSpacing = `${wm.tracking * px}px`;
    }
    g.textAlign = 'center';
    g.fillText(text, ix + iw / 2, iy + ih / 2 + px * 0.04);
  }
  g.restore();
}

/** Bounding box of a simple-icons path (they live in a 24x24 box but rarely fill it). */
const boxCache = new Map<string, { x: number; y: number; w: number; h: number }>();
function iconBox(path: string) {
  const hit = boxCache.get(path);
  if (hit) return hit;
  const S = 96;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(S / 24, S / 24);
  g.fill(new Path2D(path));
  const d = g.getImageData(0, 0, S, S).data;
  let x0 = S;
  let y0 = S;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (d[(y * S + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const k = 24 / S;
  const box = x1 >= x0 ? { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k } : { x: 0, y: 0, w: 24, h: 24 };
  boxCache.set(path, box);
  return box;
}

// ---------------------------------------------------------------- textures (cached)
const texCache = new Map<string, THREE.CanvasTexture>();

/** A single logo on a transparent background, high resolution, mipmapped. */
export function logoTexture(id: string, v: LogoVariant, w = 512, h = 256): THREE.CanvasTexture {
  const key = `${id}|${v}|${w}x${h}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const s = SPONSOR_BY_ID[id];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (s) drawLogo(g, s, v, 0, 0, w, h);
    t.needsUpdate = true;
  };
  draw();
  if (s) loadOverride(id, draw);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, t);
  return t;
}

/** A brand panel: the brand's background colour with its logo, for boards and screens. */
export function drawPanel(g: CanvasRenderingContext2D, s: Sponsor, x: number, y: number, w: number, h: number) {
  g.fillStyle = s.colors.bg;
  g.fillRect(x, y, w, h);
  drawLogo(g, s, lum(s.colors.bg) < 0.45 ? 'onDark' : 'onLight', x, y, w, h, 0.18);
}

/** Inline SVG data for UI (simple-icons path or nothing; the UI component draws wordmarks itself). */
export function iconFor(s: Sponsor) {
  return s.icon ? SI_ICONS[s.icon] : undefined;
}

export { lum as luminance };
