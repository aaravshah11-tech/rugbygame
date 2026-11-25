import { useMemo } from 'react';
import { kitDataUrl } from '../game/kit';
import { nationById } from '../data/nations';
import { playerOvr, posInfo, rarityOf, shortName, type Player } from '../data/players';
import { audio } from '../util/audio';
import { useProfile } from '../state/store';

export function TopBar({ title, accent, onBack, right }: { title: string; accent?: string; onBack?: () => void; right?: React.ReactNode }) {
  const p = useProfile();
  return (
    <div className="topbar">
      {onBack && (
        <button
          className="btn back"
          aria-label="Back"
          onClick={() => {
            audio.click();
            onBack();
          }}
        >
          ‹
        </button>
      )}
      <h1>
        {title} {accent && <span>{accent}</span>}
      </h1>
      {right}
      <span className="coins">
        <i className="coin-dot" />
        {p.coins.toLocaleString()}
      </span>
    </div>
  );
}

export function Silhouette({ color = 'rgba(0,0,0,0.55)' }: { color?: string }) {
  return (
    <svg className="sil" viewBox="0 0 44 46" aria-hidden>
      <circle cx="22" cy="11" r="8" fill={color} />
      <path d="M6 46 C6 30 12 22 22 22 C32 22 38 30 38 46 Z" fill={color} />
    </svg>
  );
}

export function PlayerCard({
  player,
  slot,
  boost,
  className = '',
  style,
  onPointerDown,
  onClick,
}: {
  player: Player | null;
  slot?: number;
  boost?: Partial<Record<string, number>>;
  className?: string;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  const flag = useMemo(() => (player ? kitDataUrl(nationById(player.nation).kit, 32) : ''), [player]);
  if (!player)
    return (
      <div className={`pcard empty ${className}`} style={style} onPointerDown={onPointerDown} onClick={onClick}>
        {slot ? posInfo(slot).short : '+'}
      </div>
    );
  const pos = slot ?? player.position;
  const ovr = playerOvr(player, pos, boost);
  const base = playerOvr(player);
  // the shine follows a finger dragged over the card (and the phone's tilt, via CSS)
  const shine = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--hx', ((e.clientX - r.left) / r.width).toFixed(3));
    e.currentTarget.style.setProperty('--hy', ((e.clientY - r.top) / r.height).toFixed(3));
  };
  return (
    <div className={`pcard ${rarityOf(base)} ${base >= 88 ? 'elite' : ''} ${className}`} style={style} onPointerDown={onPointerDown} onPointerMove={shine} onClick={onClick}>
      <span className="ovr">{ovr}</span>
      <span className="pos">{posInfo(player.position).short}</span>
      <span className="flag" style={{ backgroundImage: `url(${flag})` }} />
      <Silhouette />
      <span className="nm">{shortName(player)}</span>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.v)}
          className={o.v === value ? 'on' : ''}
          onClick={() => {
            audio.click();
            onChange(o.v);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
