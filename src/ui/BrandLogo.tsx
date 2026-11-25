import { useEffect, useState } from 'react';
import { SPONSOR_BY_ID, type Sponsor } from '../data/sponsors';
import { iconFor, loadOverride, logoColor, type LogoVariant } from '../sponsors/logo';
import { getProfile } from '../state/store';

/** Real sponsors are on unless the player switched them off. */
export const sponsorsOn = () => getProfile().settings.realSponsors !== false;

/**
 * A sponsor logo for the UI: the user's own file if they dropped one in public/sponsors, otherwise
 * the simple-icons mark (with the name beside symbol-only marks) or a wordmark in the brand's font.
 * `height` is the logo's height in px; width follows the logo.
 */
export function BrandLogo({ id, sponsor, height = 18, variant = 'onDark', className = '' }: { id?: string; sponsor?: Sponsor; height?: number; variant?: LogoVariant; className?: string }) {
  const s = sponsor ?? (id ? SPONSOR_BY_ID[id] : undefined);
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => {
    if (!s) return;
    loadOverride(s.id, () => setFile(`${import.meta.env.BASE_URL}sponsors/${s.id}`));
  }, [s]);
  if (!s) return null;
  const col = logoColor(s, variant);
  if (file)
    return <img className={`brand-logo ${className}`} src={`${file}.svg`} onError={(e) => ((e.currentTarget as HTMLImageElement).src = `${file}.png`)} alt={s.name} style={{ height }} />;
  const icon = iconFor(s);
  const wm = s.wordmark;
  const text = wm?.text ?? s.name;
  const textStyle: React.CSSProperties = {
    fontFamily: wm?.font ?? '"Helvetica Neue", Arial, sans-serif',
    fontWeight: wm?.weight ?? 800,
    fontStyle: wm?.italic ? 'italic' : 'normal',
    letterSpacing: wm?.tracking ? `${wm.tracking}em` : undefined,
    fontSize: height * (icon ? 0.62 : 0.8),
    lineHeight: 1,
    color: col,
    whiteSpace: 'nowrap',
  };
  return (
    <span className={`brand-logo ${className}`} role="img" aria-label={s.name} style={{ height, display: 'inline-flex', alignItems: 'center', gap: height * 0.22 }}>
      {icon && (
        <svg viewBox="0 0 24 24" style={{ height: icon && s.withName ? height * 0.86 : height, width: 'auto' }} fill={col} aria-hidden>
          <path d={icon.path} />
        </svg>
      )}
      {(!icon || s.withName) && <span style={textStyle}>{text}</span>}
    </span>
  );
}
