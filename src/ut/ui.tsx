import { useEffect, useState } from 'react';
import { useProfile } from '../state/store';
import { audio } from '../util/audio';
import type { ClubLook } from './store';

/** Original club badge designs: four shapes, two colours, eight emblems. */
export function ClubBadge({ c, size = 48 }: { c: ClubLook['badge']; size?: number }) {
  const shape = {
    shield: 'M50 4 L92 16 V48 C92 74 72 90 50 98 C28 90 8 74 8 48 V16 Z',
    round: 'M50 4 A46 46 0 1 1 49.9 4 Z',
    diamond: 'M50 2 L96 50 L50 98 L4 50 Z',
    crest: 'M14 8 H86 V44 C86 70 70 86 50 96 C30 86 14 70 14 44 Z M8 8 L14 18 M92 8 L86 18',
  }[c.shape];
  const em: Record<ClubLook['badge']['emblem'], React.ReactNode> = {
    star: <path d="M50 26 L56 42 L73 42 L59 52 L64 69 L50 59 L36 69 L41 52 L27 42 L44 42 Z" />,
    bolt: <path d="M55 20 L34 54 H48 L42 80 L66 44 H52 Z" />,
    lion: <path d="M50 26 C38 26 30 36 32 48 L28 58 L38 60 L42 72 H58 L62 60 L72 58 L68 48 C70 36 62 26 50 26 Z M44 46 a3 3 0 1 0 0.1 0 M56 46 a3 3 0 1 0 0.1 0" />,
    wave: <path d="M22 58 C30 44 40 44 48 54 C56 64 66 64 78 48 V64 C66 78 56 76 48 68 C40 60 30 62 22 72 Z" />,
    crown: <path d="M26 66 L30 36 L42 50 L50 30 L58 50 L70 36 L74 66 Z" />,
    ball: <g><ellipse cx="50" cy="52" rx="24" ry="15" transform="rotate(-30 50 52)" /><path d="M40 58 L60 46 M44 52 l4 4 M50 48 l4 4" stroke="var(--b1)" strokeWidth="2.4" /></g>,
    stag: <path d="M40 36 L34 22 L38 34 L30 30 L38 38 C38 48 44 54 50 56 C56 54 62 48 62 38 L70 30 L62 34 L66 22 L60 36 C56 34 44 34 40 36 Z M44 58 H56 L54 74 H46 Z" />,
    rose: <g><circle cx="50" cy="46" r="13" /><path d="M50 59 V76 M50 66 C42 62 38 66 36 70 M50 68 C58 64 62 68 64 72" stroke="currentColor" strokeWidth="3" fill="none" /></g>,
  };
  return (
    <svg className="ut-badge" width={size} height={size} viewBox="0 0 100 100" style={{ ['--b1' as string]: c.c1, color: c.c2 }} aria-label="Club badge">
      <path d={shape} fill={c.c1} stroke={c.c2} strokeWidth="5" />
      <g fill={c.c2}>{em[c.emblem]}</g>
    </svg>
  );
}

export function Coins() {
  const p = useProfile();
  return (
    <span className="ut-coins" aria-label={`${p.coins} coins`}>
      <i />
      {p.coins.toLocaleString()}
    </span>
  );
}

export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="ut-top">
      {onBack && (
        <button className="back" aria-label="Back" onClick={() => (audio.click(), onBack())}>
          ‹
        </button>
      )}
      <h1>
        {sub && <small>{sub}</small>}
        {title}
      </h1>
      <span className="grow" />
      {right}
      <Coins />
    </div>
  );
}

/** One-off message at the bottom of the screen. */
export function useToast(): [React.ReactNode, (msg: string) => void] {
  const [t, setT] = useState<{ id: number; msg: string } | null>(null);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 2400);
    return () => clearTimeout(h);
  }, [t]);
  return [t ? <div key={t.id} className="ut-toast">{t.msg}</div> : null, (msg: string) => setT({ id: Date.now(), msg })];
}

export function Bar({ v, max, color }: { v: number; max: number; color?: string }) {
  return (
    <div className="ut-bar">
      <i style={{ width: `${Math.min(100, (100 * v) / Math.max(1, max))}%`, background: color }} />
    </div>
  );
}

export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="ut-sheet" onClick={onClose}>
      <div className="ut-panel" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
