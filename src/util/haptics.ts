/**
 * Haptics. Uses the Vibration API where supported. iOS Safari has no Vibration API, but
 * Safari 18+ fires a system haptic when an <input type="checkbox" switch> is toggled, so we
 * use that as a fallback on iPhone.
 */
let enabled = true;
let switchLabel: HTMLLabelElement | null = null;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function iosSwitch() {
  if (!switchLabel) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    switchLabel = label;
  }
  switchLabel.click();
}

export type HapticKind = 'light' | 'tackle' | 'bighit' | 'try';
const patterns: Record<HapticKind, number | number[]> = {
  light: 10,
  tackle: 35,
  bighit: [60, 30, 80],
  try: [80, 50, 80, 50, 160],
};

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(patterns[kind]);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    const pulses = kind === 'light' ? 1 : kind === 'tackle' ? 1 : kind === 'bighit' ? 2 : 3;
    for (let i = 0; i < pulses; i++) setTimeout(iosSwitch, i * 120);
  } catch {
    /* ignore */
  }
}
