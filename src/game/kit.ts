import * as THREE from 'three';
import type { Kit } from '../data/nations';

/** Draws an original jersey design on a canvas. Used for 3D textures and 2D UI previews. */
export function drawKit(ctx: CanvasRenderingContext2D, kit: Kit, w: number, h: number) {
  ctx.fillStyle = kit.primary;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = kit.secondary;
  switch (kit.pattern) {
    case 'hoops':
      for (let y = 0; y < h; y += h / 5) ctx.fillRect(0, y + h / 10, w, h / 10);
      break;
    case 'stripes':
      for (let x = 0; x < w; x += w / 6) ctx.fillRect(x + w / 12, 0, w / 12, h);
      break;
    case 'sash':
      ctx.beginPath();
      ctx.moveTo(0, h * 0.15);
      ctx.lineTo(w * 0.2, 0);
      ctx.lineTo(w, h * 0.75);
      ctx.lineTo(w, h * 0.95);
      ctx.closePath();
      ctx.fill();
      break;
    case 'chevron':
      ctx.beginPath();
      ctx.moveTo(0, h * 0.25);
      ctx.lineTo(w / 2, h * 0.55);
      ctx.lineTo(w, h * 0.25);
      ctx.lineTo(w, h * 0.38);
      ctx.lineTo(w / 2, h * 0.68);
      ctx.lineTo(0, h * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = kit.accent;
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
      break;
    case 'halves':
      ctx.fillStyle = kit.accent;
      ctx.fillRect(w * 0.5, 0, w * 0.06, h);
      ctx.fillStyle = kit.secondary;
      ctx.fillRect(w * 0.44, 0, w * 0.06, h);
      break;
    case 'shoulders':
      ctx.fillRect(0, 0, w, h * 0.22);
      ctx.fillStyle = kit.accent;
      ctx.fillRect(0, h * 0.22, w, h * 0.04);
      break;
    case 'zigzag': {
      ctx.strokeStyle = kit.secondary;
      ctx.lineWidth = h * 0.035;
      for (const yy of [0.35, 0.5]) {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) ctx.lineTo((i / 8) * w, h * yy + (i % 2 ? -h * 0.06 : h * 0.06));
        ctx.stroke();
      }
      ctx.strokeStyle = kit.accent;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) ctx.lineTo((i / 8) * w, h * 0.65 + (i % 2 ? -h * 0.06 : h * 0.06));
      ctx.stroke();
      break;
    }
    case 'band':
      ctx.fillRect(0, h * 0.42, w, h * 0.16);
      ctx.fillStyle = kit.accent;
      ctx.fillRect(0, h * 0.4, w, h * 0.025);
      ctx.fillRect(0, h * 0.575, w, h * 0.025);
      break;
    case 'quarters':
      ctx.fillStyle = kit.primary;
      ctx.fillRect(0, 0, w / 2, h / 2);
      ctx.fillStyle = kit.secondary;
      ctx.fillRect(w / 2, 0, w / 2, h / 2);
      ctx.fillStyle = kit.accent;
      ctx.fillRect(0, h / 2, w / 2, h / 2);
      ctx.fillStyle = kit.fourth ?? kit.accent;
      ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
      break;
    case 'plain':
    default:
      break;
  }
  // collar
  ctx.fillStyle = kit.collar ?? kit.accent;
  ctx.beginPath();
  ctx.moveTo(w * 0.35, 0);
  ctx.lineTo(w * 0.5, h * 0.1);
  ctx.lineTo(w * 0.65, 0);
  ctx.closePath();
  ctx.fill();
  // fabric shading baked in
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const cache = new Map<string, THREE.CanvasTexture>();
export function kitTexture(kit: Kit): THREE.CanvasTexture {
  const key = JSON.stringify(kit);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  drawKit(c.getContext('2d')!, kit, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function kitDataUrl(kit: Kit, size = 64): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawKit(c.getContext('2d')!, kit, size, size);
  return c.toDataURL();
}
