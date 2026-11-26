import { memo, useRef } from 'react';
import { nationById, type Kit } from '../data/nations';
import { posInfo } from '../data/players';
import { TeamLogo } from '../ui/logos';
import { SPECIALS } from './config';
import { view, type CardView, type OwnedCard } from './pool';

/** The design a card uses: tier (+ Rare) or its special type. */
export function cardStyle(v: CardView): string {
  if (v.special) return `sp-${v.special}`;
  return `${v.tier}${v.rare ? ' rare' : ''}`;
}

/** Player silhouette in kit: head, shoulders and shirt in the team's colours. */
function Silhouette({ kit }: { kit: Kit }) {
  const stripe = kit.secondary;
  return (
    <svg className="utc-sil" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id="sil-shirt">
          <path d="M8 100 C10 78 22 68 38 64 L50 70 L62 64 C78 68 90 78 92 100 Z" />
        </clipPath>
        <linearGradient id="sil-shade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="38" rx="15" ry="18" fill="rgba(10,12,20,0.78)" />
      <path d="M43 52 L57 52 L58 66 L42 66 Z" fill="rgba(10,12,20,0.78)" />
      <g clipPath="url(#sil-shirt)">
        <rect x="0" y="60" width="100" height="40" fill={kit.primary} />
        {kit.pattern === 'hoops' && [70, 82, 94].map((y) => <rect key={y} x="0" y={y} width="100" height="6" fill={stripe} />)}
        {kit.pattern === 'stripes' && [20, 40, 60, 80].map((x) => <rect key={x} x={x} y="60" width="8" height="40" fill={stripe} />)}
        {kit.pattern === 'sash' && <path d="M10 100 L70 60 L84 60 L24 100 Z" fill={stripe} />}
        {kit.pattern === 'chevron' && <path d="M8 74 L50 88 L92 74 L92 82 L50 96 L8 82 Z" fill={stripe} />}
        {kit.pattern === 'halves' && <rect x="50" y="60" width="50" height="40" fill={stripe} />}
        {kit.pattern === 'quarters' && <rect x="50" y="60" width="50" height="20" fill={kit.fourth ?? stripe} />}
        <path d="M38 64 L50 74 L62 64 L60 62 L50 69 L40 62 Z" fill={kit.collar ?? stripe} />
        <rect x="0" y="60" width="100" height="40" fill="url(#sil-shade)" />
      </g>
    </svg>
  );
}

const STAT_KEYS = ['PAC', 'STR', 'HAN', 'KCK', 'TKL', 'WRK'] as const;

/**
 * A player card, FC style (original art): OVR, position, team badge, silhouette in kit, name and
 * six face stats. Drag across it (or tilt the phone) and the holographic shine moves.
 */
export const UTCard = memo(function UTCard({
  card,
  size = 120,
  onClick,
  dim,
  badge,
  hideStats,
}: {
  card: OwnedCard;
  size?: number;
  onClick?: () => void;
  dim?: boolean;
  /** small corner label (e.g. "x2", "LOAN", "NEW") */
  badge?: string;
  hideStats?: boolean;
}) {
  const v = view(card);
  const ref = useRef<HTMLDivElement>(null);
  const team = nationById(v.league === 'ICON' ? v.nation : v.team);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width).toFixed(3));
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height).toFixed(3));
  };
  return (
    <div
      ref={ref}
      className={`utc ${cardStyle(v)} ${dim ? 'dim' : ''} ${size < 90 ? 'mini' : ''} ${onClick ? 'tappable' : ''}`}
      style={{ ['--w' as string]: `${size}px` }}
      onPointerMove={move}
      onPointerLeave={() => {
        ref.current?.style.removeProperty('--mx');
        ref.current?.style.removeProperty('--my');
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={`${v.name} ${v.ovr} ${posInfo(v.pos).short}`}
    >
      <div className="utc-bg" />
      <Silhouette kit={team.kit} />
      <div className="utc-top">
        <b className="utc-ovr">{v.ovr}</b>
        <span className="utc-pos">{posInfo(v.pos).short}</span>
        <span className="utc-badge">
          <TeamLogo id={v.league === 'ICON' ? v.nation : v.team} size={Math.round(size * 0.17)} />
        </span>
      </div>
      {v.special && <div className="utc-type">{SPECIALS[v.special].short}</div>}
      {v.base.academy && !v.special && <div className="utc-type acad">ACADEMY</div>}
      <div className="utc-name">{v.name}</div>
      {!hideStats && (
        <div className="utc-stats">
          {STAT_KEYS.map((k) => (
            <span key={k}>
              <b>{v.face[k]}</b>
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="utc-shine" />
      {badge && <i className="utc-corner">{badge}</i>}
    </div>
  );
});

/** A card from its view (for lists that already have the view). */
export const cardOf = (v: CardView) => v.card;
