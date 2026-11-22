/** Graphics quality tiers. "auto" picks a tier from the device and then adapts to measured FPS. */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowCasters: number;
  bloom: boolean;
  msaa: number;
  crowdDensity: number;
  pitchPxPerMetre: number;
  particles: number;
  targetFps: 30 | 60;
}

export function preset(level: QualityLevel): QualityPreset {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  switch (level) {
    case 'high':
      return { level, pixelRatio: dpr, shadows: true, shadowMapSize: 2048, shadowCasters: 6, bloom: true, msaa: 4, crowdDensity: 1, pitchPxPerMetre: 16, particles: 1, targetFps: 60 };
    case 'medium':
      return { level, pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowMapSize: 1024, shadowCasters: 6, bloom: true, msaa: 0, crowdDensity: 0.6, pitchPxPerMetre: 12, particles: 0.7, targetFps: 60 };
    case 'low':
    default:
      return { level: 'low', pixelRatio: Math.min(dpr, 1.25), shadows: false, shadowMapSize: 512, shadowCasters: 0, bloom: false, msaa: 0, crowdDensity: 0.3, pitchPxPerMetre: 9, particles: 0.4, targetFps: 30 };
  }
}

/**
 * iOS hides the GPU model, so we use the native screen resolution as a proxy:
 * iPhone 12 and newer are 2532px+ tall; iPads get High; older/smaller phones get Medium or Low.
 */
export function autoLevel(): QualityLevel {
  const dpr = window.devicePixelRatio || 1;
  const longSide = Math.max(screen.width, screen.height) * dpr;
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ipad) return longSide >= 2360 ? 'high' : 'medium';
  if (longSide >= 2532) return 'high';
  if (longSide >= 1792) return 'medium';
  return 'low';
}

export function resolveQuality(setting: QualitySetting): QualityLevel {
  return setting === 'auto' ? autoLevel() : setting;
}

/** Watches frame times. In auto mode it steps quality down, and finally caps to 30fps. */
export class FpsGovernor {
  private acc = 0;
  private frames = 0;
  private grace = 3;
  fps = 60;

  constructor(private auto: boolean, private onDowngrade: () => boolean, private onCap30: () => void) {}

  tick(dt: number) {
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.grace > 0) {
      this.grace--;
      return;
    }
    if (!this.auto) return;
    if (this.fps < 48) {
      if (!this.onDowngrade()) this.onCap30();
      this.grace = 2;
    }
  }
}
