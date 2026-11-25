import { audio } from '../util/audio';
import { haptic } from '../util/haptics';

/**
 * Every tap on a menu control gets the same feel: the CSS :active press-down, a light haptic
 * and a crisp click (audio.click() de-duplicates, so buttons that also click on their own
 * still make one sound). In-match controls have their own feedback and are left alone.
 */
const TAPPABLE = 'button, .tile, .nation-btn, [role="button"], summary';
const SKIP = '.abtn, .joy-zone, .swipe-layer, .pk-layer, .charge-layer, .contest-layer, .dodge-layer, .kick-aim, .scrum-battle, .mini';

export function installTapFeedback() {
  // iOS only applies :active styles once a touch listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(TAPPABLE) as HTMLElement | null;
      if (!el || el.closest(SKIP) || (el as HTMLButtonElement).disabled) return;
      haptic('light');
      audio.click();
    },
    { passive: true, capture: true },
  );
}
