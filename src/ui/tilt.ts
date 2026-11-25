/**
 * Device tilt as two CSS variables on <html>, --tilt-x and --tilt-y (-1..1), for effects such as
 * the holographic card shine. iOS only sends tilt once permission is granted (the main menu
 * asks when the player is touched); Android and desktop send it straight away.
 */
export function installTilt() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  const root = document.documentElement.style;
  let raf = 0;
  let x = 0;
  let y = 0;
  window.addEventListener(
    'deviceorientation',
    (e) => {
      if (e.gamma == null || e.beta == null) return;
      const land = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
      x = Math.max(-1, Math.min(1, (land ? e.beta : e.gamma) / 30));
      y = Math.max(-1, Math.min(1, ((land ? e.gamma : e.beta - 45) as number) / 30));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.setProperty('--tilt-x', x.toFixed(3));
        root.setProperty('--tilt-y', y.toFixed(3));
      });
    },
    { passive: true },
  );
}
