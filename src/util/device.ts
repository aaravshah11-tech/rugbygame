/** Device detection: Try Line runs on iPhone and iPad only. */
export type DeviceKind = 'iphone' | 'ipad' | 'unsupported';

export function detectDevice(): DeviceKind {
  const ua = navigator.userAgent || '';
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!touch) return 'unsupported';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/iPad/.test(ua)) return 'ipad';
  // iPadOS 13+ reports a Mac user agent in desktop-class Safari; real Macs have no multi-touch.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ipad';
  return 'unsupported';
}

/**
 * Development builds only: `?device=iphone` or `?device=ipad` lets you test in a desktop browser.
 * Production builds always enforce the real device check.
 */
export function resolveDevice(): DeviceKind {
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(location.search).get('device');
    if (forced === 'iphone' || forced === 'ipad') return forced;
  }
  return detectDevice();
}

export function isStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}
