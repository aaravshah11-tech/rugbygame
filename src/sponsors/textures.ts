import * as THREE from 'three';
import type { Sponsor } from '../data/sponsors';
import { drawLogo, drawPanel, loadOverride, logoColor, luminance } from './logo';

const tex = (c: HTMLCanvasElement, wrap = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (wrap) t.wrapS = THREE.RepeatWrapping;
  return t;
};
const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
/** LED pixel grid over a board texture. */
function ledGrid(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  const step = Math.max(2, Math.round(h / 32));
  for (let y = 0; y < h; y += step) g.fillRect(0, y, w, 1);
}
/** Redraw when any user override logo arrives. */
function watch(list: Sponsor[], redraw: () => void) {
  for (const s of list) loadOverride(s.id, redraw);
}

/**
 * The LED board running order as one strip (a texture atlas of brand panels). Panels are 4:1, the
 * shape of a board section; the strip wraps seamlessly so it can scroll forever.
 */
export function boardStrip(list: Sponsor[], low: boolean) {
  const ph = low ? 64 : 128;
  const pw = ph * 4;
  const n = Math.max(4, Math.min(low ? 8 : 16, list.length));
  const c = canvas(pw * n, ph);
  const t = tex(c, true);
  const draw = () => {
    const g = c.getContext('2d')!;
    for (let i = 0; i < n; i++) {
      drawPanel(g, list[i % list.length], i * pw, 0, pw, ph);
      // thin dark gap between panels
      g.fillStyle = '#000';
      g.fillRect(i * pw, 0, 2, ph);
    }
    ledGrid(g, c.width, ph);
    t.needsUpdate = true;
  };
  draw();
  watch(list, draw);
  return { texture: t, panels: n };
}

/** Full-width takeover: one brand repeated along the whole board, same size as the strip. */
export function takeoverTexture(low: boolean, panels: number) {
  const ph = low ? 64 : 128;
  const pw = ph * 4;
  const c = canvas(pw * panels, ph);
  const t = tex(c, true);
  return {
    texture: t,
    show(s: Sponsor) {
      const g = c.getContext('2d')!;
      for (let i = 0; i < panels; i++) drawPanel(g, s, i * pw, 0, pw, ph);
      ledGrid(g, c.width, ph);
      t.needsUpdate = true;
    },
  };
}

/** Try celebration on the boards: TRY! and the title sponsor's logo in its own colours. */
export function tryBoardTexture(title: Sponsor, low: boolean) {
  const ph = low ? 64 : 128;
  const c = canvas(ph * 16, ph);
  const g = c.getContext('2d')!;
  const t = tex(c, true);
  const draw = () => {
    for (let i = 0; i < 4; i++) {
      const x = i * ph * 4;
      const inv = i % 2 === 1;
      g.fillStyle = inv ? title.colors.primary : title.colors.bg;
      g.fillRect(x, 0, ph * 4, ph);
      if (i % 2 === 0) {
        g.font = `italic 900 ${Math.round(ph * 0.72)}px "Arial Black", Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = luminance(title.colors.bg) < 0.45 ? '#ffffff' : '#111111';
        g.fillText('TRY!', x + ph * 2, ph * 0.54);
      } else drawLogo(g, title, luminance(title.colors.primary) < 0.45 ? 'onDark' : 'onLight', x, 0, ph * 4, ph, 0.16);
    }
    ledGrid(g, c.width, ph);
    t.needsUpdate = true;
  };
  draw();
  watch([title], draw);
  return t;
}

/** A logo on a solid panel, for small boards, the tunnel and dugouts. */
export function panelTexture(s: Sponsor, w = 512, h = 128) {
  const c = canvas(w, h);
  const t = tex(c);
  const draw = () => {
    drawPanel(c.getContext('2d')!, s, 0, 0, w, h);
    t.needsUpdate = true;
  };
  draw();
  watch([s], draw);
  return t;
}

/** The interview backdrop: a step-and-repeat grid of the title sponsor and partners on white. */
export function backdropTexture(list: Sponsor[]) {
  const c = canvas(1024, 512);
  const t = tex(c);
  const draw = () => {
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1024, 512);
    const cw = 256;
    const ch = 102;
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5; col++) {
        const s = list[(row * 2 + col) % list.length];
        const x = col * cw - (row % 2 ? cw / 2 : 0);
        drawLogo(g, s, 'onLight', x, row * ch, cw, ch, 0.2);
      }
    t.needsUpdate = true;
  };
  draw();
  watch(list, draw);
  return t;
}

/** Post pad: the pad colour with the title sponsor's logo twice round it and a white band. */
export function padTextureWithLogo(color: string, band: string, s: Sponsor) {
  const c = canvas(512, 256);
  const t = tex(c);
  const draw = () => {
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = band;
    g.fillRect(0, 26, 512, 14);
    g.fillRect(0, 216, 512, 14);
    for (const x of [0, 256]) drawLogo(g, s, luminance(color) < 0.45 ? 'onDark' : 'onLight', x + 16, 60, 224, 140, 0.08);
    t.needsUpdate = true;
  };
  draw();
  watch([s], draw);
  return t;
}

/** Flag cloth: the title sponsor's background colour with its logo. */
export function flagTexture(s: Sponsor) {
  const c = canvas(256, 186);
  const t = tex(c);
  const draw = () => {
    const g = c.getContext('2d')!;
    drawPanel(g, s, 0, 0, 256, 186);
    t.needsUpdate = true;
  };
  draw();
  watch([s], draw);
  return t;
}

/** A painted pitch logo: white or the brand colour, as an alpha mask the grass shows through. */
export function pitchLogoTexture(s: Sponsor) {
  const c = canvas(1024, 512);
  const t = tex(c);
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 1024, 512);
    // painted in the brand colour when it shows on grass, otherwise white
    const col = logoColor(s, 'brand');
    const v = luminance(col) > 0.12 && Math.abs(luminance(col) - 0.25) > 0.06 ? 'brand' : 'onDark';
    drawLogo(g, s, v, 0, 0, 1024, 512, 0.06);
    t.needsUpdate = true;
  };
  draw();
  watch([s], draw);
  return t;
}
