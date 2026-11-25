import type { ReactElement } from 'react';
import { nationById } from '../data/nations';

/**
 * Team emblems: a shield in the team colours with a simple symbol for each side.
 * Everything is drawn in a 100x100 viewBox; `f` is the symbol colour, `a` the accent.
 */
type Sym = (f: string, a: string) => ReactElement;

const petals = (n: number, r: number, cx: number, cy: number, pr: number, fill: string) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    return <circle key={i} cx={cx + Math.cos(t) * r} cy={cy + Math.sin(t) * r} r={pr} fill={fill} />;
  });

const star = (cx: number, cy: number, r: number, fill: string, key?: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(t) * rr).toFixed(1)},${(cy + Math.sin(t) * rr).toFixed(1)}`;
  });
  return <polygon key={key} points={pts.join(' ')} fill={fill} />;
};

const text = (s: string, f: string, size = 30, y = 58) => (
  <text x="50" y={y} textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight={900} fontStyle="italic" fontSize={size} fill={f}>
    {s}
  </text>
);

const SYMBOLS: Record<string, Sym> = {
  // Nations
  ENG: (_f, a) => (
    <g>
      <path d="M50 66 L50 80 M50 74 C44 70 40 72 38 76 M50 72 C56 68 60 70 62 74" stroke="#2e7d32" strokeWidth="3" fill="none" />
      {petals(5, 12, 50, 47, 10, a)}
      {petals(5, 6, 50, 47, 6.5, '#ff5a6e')}
      <circle cx="50" cy="47" r="4.5" fill="#ffd54a" />
    </g>
  ),
  WAL: (f, a) => (
    <g fill={f}>
      <path d="M50 26 C41 36 42 52 50 64 C58 52 59 36 50 26Z" />
      <path d="M34 34 C27 44 30 58 40 66 C43 54 41 42 34 34Z" />
      <path d="M66 34 C73 44 70 58 60 66 C57 54 59 42 66 34Z" />
      <rect x="36" y="66" width="28" height="7" rx="2" fill={a} />
    </g>
  ),
  SCO: () => (
    <g>
      <path d="M50 58 L50 80" stroke="#3d8b40" strokeWidth="4" />
      <path d="M50 70 C42 66 36 70 33 76 C40 75 46 74 50 72Z M50 66 C58 62 64 66 67 72 C60 71 54 70 50 68Z" fill="#3d8b40" />
      <ellipse cx="50" cy="55" rx="11" ry="8" fill="#3d8b40" />
      <path d="M38 46 L42 26 L46 44 L50 22 L54 44 L58 26 L62 46Z" fill="#a77be0" />
    </g>
  ),
  IRE: () => (
    <g fill="#ffffff">
      <circle cx="50" cy="36" r="11" />
      <circle cx="38" cy="54" r="11" />
      <circle cx="62" cy="54" r="11" />
      <path d="M48 52 C50 64 54 72 60 80" stroke="#ffffff" strokeWidth="4" fill="none" />
    </g>
  ),
  FRA: (f, a) => (
    <g>
      <path d="M40 30 L44 22 L48 30 L52 21 L55 31 L60 30 L58 36 C64 40 64 48 60 52 L70 44 C76 38 82 42 80 52 C78 64 66 72 54 72 L50 80 L46 72 C36 70 32 60 36 50 C38 44 42 40 42 36 L36 38Z" fill={f} />
      <path d="M40 30 L44 22 L48 30 L52 21 L55 31 L60 30 L58 36 L42 36Z" fill={a} />
      <circle cx="51" cy="40" r="2" fill={a} />
    </g>
  ),
  ITA: () => (
    <g>
      <path d="M32 28 H68 V56 C68 68 58 76 50 80 C42 76 32 68 32 56Z" fill="#ffffff" />
      <path d="M32 28 H44 V75 C37 70 32 64 32 56Z" fill="#0a9f4b" />
      <path d="M56 28 H68 V56 C68 64 63 70 56 75Z" fill="#d81e3a" />
    </g>
  ),
  NZL: (f) => (
    <g fill={f}>
      <path d="M50 82 C48 64 46 46 54 22" stroke={f} strokeWidth="3.5" fill="none" />
      {Array.from({ length: 9 }, (_, i) => {
        const y = 30 + i * 5.5;
        const len = 6 + i * 1.6;
        const x = 53 - i * 0.55;
        return (
          <g key={i}>
            <path d={`M${x} ${y} C${x - len * 0.5} ${y - 4} ${x - len} ${y - 2} ${x - len - 2} ${y + 2} C${x - len * 0.6} ${y + 2} ${x - 2} ${y + 2} ${x} ${y + 1}Z`} />
            <path d={`M${x} ${y} C${x + len * 0.5} ${y - 4} ${x + len} ${y - 2} ${x + len + 2} ${y + 2} C${x + len * 0.6} ${y + 2} ${x + 2} ${y + 2} ${x} ${y + 1}Z`} />
          </g>
        );
      })}
    </g>
  ),
  RSA: (f, a) => (
    <g>
      <path d="M44 30 C36 22 34 14 40 10 C38 18 42 24 48 30Z M56 30 C64 22 66 14 60 10 C62 18 58 24 52 30Z" fill={a} />
      <path d="M38 34 L46 30 L54 30 L62 34 L60 42 C58 54 56 66 50 76 C44 66 42 54 40 42Z" fill={f} />
      <path d="M36 36 L28 32 L33 42Z M64 36 L72 32 L67 42Z" fill={f} />
      <circle cx="45" cy="44" r="2.2" fill={a} />
      <circle cx="55" cy="44" r="2.2" fill={a} />
      <path d="M46 70 L54 70 L50 77Z" fill={a} />
    </g>
  ),
  AUS: (f) => (
    <g fill={f}>
      <path d="M62 24 L66 18 L67 26 C72 30 72 36 68 38 C66 46 64 52 66 60 C68 66 74 70 82 72 L82 76 C72 76 64 72 60 68 L54 76 L44 78 L50 70 C44 64 40 56 42 48 C44 40 52 34 60 34 C58 30 58 26 62 24Z" />
      <path d="M44 62 C36 66 26 74 18 80 C28 74 36 70 46 68Z" />
    </g>
  ),
  ARG: (_f, a) => (
    <g>
      {Array.from({ length: 16 }, (_, i) => {
        const t = (i / 16) * Math.PI * 2;
        const r1 = 15;
        const r2 = i % 2 ? 26 : 30;
        return <line key={i} x1={50 + Math.cos(t) * r1} y1={52 + Math.sin(t) * r1} x2={50 + Math.cos(t) * r2} y2={52 + Math.sin(t) * r2} stroke="#f6b81a" strokeWidth="3.5" strokeLinecap="round" />;
      })}
      <circle cx="50" cy="52" r="13" fill="#f6b81a" />
      <circle cx="45" cy="49" r="1.6" fill={a} />
      <circle cx="55" cy="49" r="1.6" fill={a} />
      <path d="M45 57 Q50 61 55 57" stroke={a} strokeWidth="1.8" fill="none" />
    </g>
  ),
  FIJ: (f, a) => (
    <g>
      <path d="M50 80 C52 66 52 52 49 40" stroke={a} strokeWidth="4" fill="none" />
      <g fill={f}>
        <path d="M49 40 C40 30 28 32 22 40 C32 36 40 38 49 42Z" />
        <path d="M49 40 C58 30 70 32 78 40 C68 36 60 38 49 42Z" />
        <path d="M49 40 C44 28 46 20 52 16 C50 26 52 32 50 40Z" />
        <path d="M49 40 C38 38 30 46 28 54 C36 46 42 44 49 42Z" />
        <path d="M49 40 C60 38 68 46 70 54 C62 46 56 44 49 42Z" />
      </g>
      <circle cx="46" cy="44" r="3" fill="#8d5524" />
      <circle cx="53" cy="45" r="3" fill="#8d5524" />
    </g>
  ),
  JPN: () => (
    <g>
      {petals(5, 13, 50, 50, 11, '#ffb7c5')}
      {petals(5, 13, 50, 50, 5, '#ff8fab')}
      <circle cx="50" cy="50" r="6" fill="#ffffff" />
      {petals(5, 4, 50, 50, 1.5, '#d3122f')}
    </g>
  ),
  TGA: (f) => (
    <g fill={f}>
      <rect x="44" y="22" width="12" height="56" rx="2" />
      <rect x="30" y="36" width="40" height="12" rx="2" />
    </g>
  ),
  SAM: (f) => <g>{[[50, 26, 9], [36, 50, 8], [64, 46, 8], [50, 72, 9], [57, 58, 5]].map(([x, y, r], i) => star(x, y, r, f, i))}</g>,

  // Premiership clubs
  BTH: (f, a) => (
    <g>
      <rect x="30" y="28" width="40" height="8" fill={a} />
      <rect x="30" y="46" width="40" height="8" fill={a} />
      <rect x="30" y="64" width="40" height="8" fill={a} />
      {text('B', f, 44, 66)}
    </g>
  ),
  BRS: (f, a) => (
    <g>
      <circle cx="34" cy="32" r="9" fill={f} />
      <circle cx="66" cy="32" r="9" fill={f} />
      <circle cx="34" cy="32" r="4.5" fill={a} />
      <circle cx="66" cy="32" r="4.5" fill={a} />
      <ellipse cx="50" cy="52" rx="22" ry="20" fill={f} />
      <ellipse cx="50" cy="60" rx="10" ry="8" fill={a} />
      <ellipse cx="50" cy="56" rx="4" ry="3" fill="#111" />
      <circle cx="41" cy="46" r="2.6" fill="#111" />
      <circle cx="59" cy="46" r="2.6" fill="#111" />
    </g>
  ),
  EXE: (f, a) => (
    <g>
      <path d="M26 36 L50 24 L74 36 L74 46 L50 34 L26 46Z" fill={a} />
      <path d="M26 52 L50 40 L74 52 L74 62 L50 50 L26 62Z" fill={f} />
      {text('EC', f, 18, 80)}
    </g>
  ),
  GLO: (f, a) => (
    <g>
      <circle cx="50" cy="50" r="24" fill={a} />
      <circle cx="50" cy="50" r="16" fill={f} />
      <circle cx="50" cy="50" r="9" fill={a} />
      <rect x="50" y="44" width="24" height="12" fill={f} />
      <rect x="50" y="48" width="14" height="4" fill={a} />
    </g>
  ),
  LEI: (f, a) => (
    <g>
      <circle cx="33" cy="30" r="8" fill="#f28c28" />
      <circle cx="67" cy="30" r="8" fill="#f28c28" />
      <ellipse cx="50" cy="52" rx="24" ry="24" fill="#f28c28" />
      <path d="M50 28 L46 40 L54 40Z M30 48 L40 50 L30 54Z M70 48 L60 50 L70 54Z M32 62 L42 60 L34 68Z M68 62 L58 60 L66 68Z" fill="#111" />
      <ellipse cx="50" cy="64" rx="11" ry="8" fill="#fff" />
      <path d="M46 60 L54 60 L50 65Z" fill="#111" />
      <ellipse cx="41" cy="48" rx="3.5" ry="2.5" fill={a} />
      <ellipse cx="59" cy="48" rx="3.5" ry="2.5" fill={a} />
      <circle cx="41" cy="48" r="1.4" fill="#111" />
      <circle cx="59" cy="48" r="1.4" fill="#111" />
      <circle cx="50" cy="50" r="0" fill={f} />
    </g>
  ),
  LDN: (f, a) => (
    <g>
      <circle cx="46" cy="52" r="24" fill={f} />
      <circle cx="56" cy="48" r="21" fill="var(--logo-bg)" />
      {star(66, 52, 10, a)}
    </g>
  ),
  LDW: () => (
    <g>
      {text('HQ', '#ffffff', 26, 60)}
    </g>
  ),
  NEW: (f, a) => (
    <g>
      <path d="M22 30 C26 44 34 48 40 46 L36 40 C30 40 26 36 22 30Z M78 30 C74 44 66 48 60 46 L64 40 C70 40 74 36 78 30Z" fill={a} />
      <path d="M38 40 L62 40 L60 64 C58 72 54 76 50 76 C46 76 42 72 40 64Z" fill={f} />
      <circle cx="45" cy="52" r="2.4" fill={a} />
      <circle cx="55" cy="52" r="2.4" fill={a} />
      <ellipse cx="50" cy="68" rx="6" ry="4" fill={a} />
    </g>
  ),
  NOR: (f, a) => (
    <g>
      <ellipse cx="50" cy="26" rx="16" ry="5" fill="none" stroke={a} strokeWidth="3.5" />
      {text('S', f, 46, 72)}
    </g>
  ),
  SAL: (f, a) => (
    <g>
      <path d="M30 66 C40 60 48 44 50 24 C58 38 66 54 74 66Z" fill={f} />
      <path d="M20 70 C30 64 40 72 50 68 C60 64 70 72 80 68 L80 76 C70 80 60 72 50 76 C40 80 30 72 20 78Z" fill={a} />
    </g>
  ),
};

const SHIELD = 'M50 4 L90 14 V46 C90 72 72 88 50 96 C28 88 10 72 10 46 V14Z';

/** Readable symbol colour against a background. */
function contrast(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#14182a' : '#ffffff';
}

/** Teams with a real logo image in public/logos (nations are white artwork, clubs full colour). */
// BGS: the school shield on a claret disc, drawn like the nation badges
const LOGO_NATIONS = new Set(['ENG', 'FRA', 'IRE', 'ITA', 'SCO', 'WAL', 'NZL', 'ARG', 'AUS', 'FIJ', 'JPN', 'RSA', 'BGS']);
const LOGO_CLUBS = new Set(['BTH', 'BRS', 'EXE', 'GLO', 'LEI', 'LDN', 'LDW', 'NEW', 'NOR', 'SAL']);

export function TeamLogo({ id, size = 36 }: { id: string; size?: number }) {
  const n = nationById(id);
  const k = n.kit;
  if (LOGO_NATIONS.has(id) || LOGO_CLUBS.has(id)) {
    const club = LOGO_CLUBS.has(id);
    // White nation artwork sits on the team colour (dark secondary for very light shirts).
    const lum = (c: string) => {
      const v = parseInt(c.slice(1), 16);
      return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
    };
    const disc = club ? '#ffffff' : lum(k.primary) < 150 ? k.primary : [k.secondary, k.accent, k.shorts].sort((x, y) => lum(x) - lum(y))[0];
    return (
      <span
        className="team-logo"
        aria-label={`${n.name} logo`}
        style={{
          width: size, height: size, flex: 'none', borderRadius: '50%', background: disc,
          display: 'inline-grid', placeItems: 'center', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.18)',
        }}
      >
        <img src={`${import.meta.env.BASE_URL}logos/${id}.png?v=2`} alt="" draggable={false} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
      </span>
    );
  }
  // Very light shirts (England, Fiji) use the secondary colour for the shield.
  const bg = contrast(k.primary) === '#14182a' ? k.secondary : k.primary;
  const rim = contrast(k.primary) === '#14182a' ? k.primary : k.secondary === bg ? k.accent : k.secondary;
  const f = contrast(bg);
  const a = k.accent.toLowerCase() === bg.toLowerCase() ? rim : k.accent;
  const sym = SYMBOLS[id];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="team-logo" style={{ ['--logo-bg' as string]: bg, flex: 'none' }} aria-label={`${n.name} emblem`}>
      <path d={SHIELD} fill={bg} stroke={rim} strokeWidth="6" />
      {id === 'LDW' && (
        <g clipPath="url(#hq)">
          <clipPath id="hq">
            <path d={SHIELD} />
          </clipPath>
          <rect x="0" y="0" width="50" height="50" fill="#7ec8e3" />
          <rect x="50" y="0" width="50" height="50" fill="#8c1d40" />
          <rect x="0" y="50" width="50" height="50" fill="#5a3b1e" />
          <rect x="50" y="50" width="50" height="50" fill="#0a7a3c" />
        </g>
      )}
      {sym ? sym(f, a) : text(n.short.slice(0, 3), f, 26, 60)}
    </svg>
  );
}
