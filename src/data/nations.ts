/** Nations and their kits, in each team's real colours. */
export type KitPattern = 'plain' | 'hoops' | 'stripes' | 'sash' | 'chevron' | 'halves' | 'shoulders' | 'zigzag' | 'band' | 'quarters';

export interface Kit {
  primary: string;
  secondary: string;
  accent: string;
  pattern: KitPattern;
  shorts: string;
  socks: string;
  /** fourth colour (Harlequins' quarters) */
  fourth?: string;
  /** collar / cuffs colour if different from secondary */
  collar?: string;
}

export interface Nation {
  id: string;
  name: string;
  short: string;
  strength: number; // 0..100 baseline for squad generation
  kit: Kit;
  region: NameRegion;
}

export type NameRegion = 'anglo' | 'celtic' | 'french' | 'italian' | 'pacific' | 'japanese' | 'latin' | 'afrikaans' | 'maori';

export const NATIONS: Nation[] = [
  { id: 'ENG', name: 'England', short: 'ENG', strength: 84, region: 'anglo',
    kit: { primary: '#f5f6f8', secondary: '#1b2a5c', accent: '#c8102e', pattern: 'plain', shorts: '#1b2a5c', socks: '#1b2a5c', collar: '#1b2a5c' } },
  { id: 'WAL', name: 'Wales', short: 'WAL', strength: 80, region: 'celtic',
    kit: { primary: '#c8102e', secondary: '#ffffff', accent: '#00843d', pattern: 'plain', shorts: '#ffffff', socks: '#c8102e', collar: '#ffffff' } },
  { id: 'SCO', name: 'Scotland', short: 'SCO', strength: 82, region: 'celtic',
    kit: { primary: '#0e1b45', secondary: '#ffffff', accent: '#6f4a9e', pattern: 'plain', shorts: '#ffffff', socks: '#0e1b45', collar: '#6f4a9e' } },
  { id: 'IRE', name: 'Ireland', short: 'IRE', strength: 87, region: 'celtic',
    kit: { primary: '#0b7a3e', secondary: '#ffffff', accent: '#ffffff', pattern: 'plain', shorts: '#ffffff', socks: '#0b7a3e', collar: '#063f20' } },
  { id: 'FRA', name: 'France', short: 'FRA', strength: 87, region: 'french',
    kit: { primary: '#14237a', secondary: '#ffffff', accent: '#e4202e', pattern: 'plain', shorts: '#ffffff', socks: '#e4202e', collar: '#e4202e' } },
  { id: 'ITA', name: 'Italy', short: 'ITA', strength: 76, region: 'italian',
    kit: { primary: '#1a5fd0', secondary: '#ffffff', accent: '#0a9f4b', pattern: 'plain', shorts: '#ffffff', socks: '#1a5fd0', collar: '#ffffff' } },
  { id: 'NZL', name: 'New Zealand', short: 'NZL', strength: 89, region: 'maori',
    kit: { primary: '#0b0b0d', secondary: '#ffffff', accent: '#ffffff', pattern: 'plain', shorts: '#0b0b0d', socks: '#0b0b0d', collar: '#0b0b0d' } },
  { id: 'RSA', name: 'South Africa', short: 'RSA', strength: 89, region: 'afrikaans',
    kit: { primary: '#0b5a35', secondary: '#f6b81a', accent: '#f6b81a', pattern: 'plain', shorts: '#ffffff', socks: '#0b5a35', collar: '#f6b81a' } },
  { id: 'AUS', name: 'Australia', short: 'AUS', strength: 82, region: 'anglo',
    kit: { primary: '#f7c600', secondary: '#0c5c3a', accent: '#0c5c3a', pattern: 'plain', shorts: '#f7c600', socks: '#f7c600', collar: '#0c5c3a' } },
  { id: 'ARG', name: 'Argentina', short: 'ARG', strength: 82, region: 'latin',
    kit: { primary: '#7cc7f2', secondary: '#ffffff', accent: '#14214d', pattern: 'hoops', shorts: '#14214d', socks: '#7cc7f2', collar: '#14214d' } },
  { id: 'FIJ', name: 'Fiji', short: 'FIJ', strength: 79, region: 'pacific',
    kit: { primary: '#ffffff', secondary: '#111111', accent: '#1aa6b7', pattern: 'shoulders', shorts: '#111111', socks: '#111111', collar: '#111111' } },
  { id: 'JPN', name: 'Japan', short: 'JPN', strength: 78, region: 'japanese',
    kit: { primary: '#d3122f', secondary: '#ffffff', accent: '#151b3a', pattern: 'hoops', shorts: '#151b3a', socks: '#151b3a', collar: '#ffffff' } },
  { id: 'TGA', name: 'Tonga', short: 'TGA', strength: 74, region: 'pacific',
    kit: { primary: '#c8102e', secondary: '#ffffff', accent: '#ffffff', pattern: 'plain', shorts: '#ffffff', socks: '#c8102e', collar: '#ffffff' } },
  { id: 'SAM', name: 'Samoa', short: 'SAM', strength: 75, region: 'pacific',
    kit: { primary: '#1d3f9e', secondary: '#ffffff', accent: '#ffffff', pattern: 'plain', shorts: '#1d3f9e', socks: '#1d3f9e', collar: '#ffffff' } },
];

/** Premiership clubs (private build). Kits are simple designs in each club's colours. */
export const CLUBS: Nation[] = [
  { id: 'BTH', name: 'Bath Rugby', short: 'BTH', strength: 81, region: 'anglo',
    kit: { primary: '#1f3f8f', secondary: '#111111', accent: '#ffffff', pattern: 'hoops', shorts: '#111111', socks: '#1f3f8f', collar: '#ffffff' } },
  { id: 'BRS', name: 'Bristol Bears', short: 'BRI', strength: 80, region: 'anglo',
    kit: { primary: '#0e1f45', secondary: '#c8102e', accent: '#ffffff', pattern: 'plain', shorts: '#0e1f45', socks: '#0e1f45', collar: '#c8102e' } },
  { id: 'EXE', name: 'Exeter Chiefs', short: 'EXE', strength: 78, region: 'anglo',
    kit: { primary: '#111111', secondary: '#ffffff', accent: '#c4a64a', pattern: 'plain', shorts: '#111111', socks: '#111111', collar: '#ffffff' } },
  { id: 'GLO', name: 'Gloucester Rugby', short: 'GLO', strength: 77, region: 'anglo',
    kit: { primary: '#b0102b', secondary: '#ffffff', accent: '#111111', pattern: 'hoops', shorts: '#111111', socks: '#b0102b', collar: '#111111' } },
  { id: 'LEI', name: 'Leicester Tigers', short: 'LEI', strength: 80, region: 'anglo',
    kit: { primary: '#0f6b3a', secondary: '#c8102e', accent: '#ffffff', pattern: 'band', shorts: '#ffffff', socks: '#0f6b3a', collar: '#ffffff' } },
  { id: 'LDN', name: 'Saracens', short: 'SAR', strength: 81, region: 'anglo',
    kit: { primary: '#111111', secondary: '#c8102e', accent: '#ffffff', pattern: 'shoulders', shorts: '#111111', socks: '#111111', collar: '#c8102e' } },
  { id: 'LDW', name: 'Harlequins', short: 'HAR', strength: 79, region: 'anglo',
    kit: { primary: '#7ec8e3', secondary: '#8c1d40', accent: '#5a3b1e', pattern: 'quarters', shorts: '#ffffff', socks: '#8c1d40', fourth: '#0a7a3c', collar: '#ffffff' } },
  { id: 'NEW', name: 'Newcastle Red Bulls', short: 'NEW', strength: 72, region: 'anglo',
    kit: { primary: '#0d1b3e', secondary: '#d4002a', accent: '#f2c500', pattern: 'shoulders', shorts: '#0d1b3e', socks: '#0d1b3e', collar: '#f2c500' } },
  { id: 'NOR', name: 'Northampton Saints', short: 'NOR', strength: 81, region: 'anglo',
    kit: { primary: '#0a5c36', secondary: '#111111', accent: '#c9a227', pattern: 'hoops', shorts: '#111111', socks: '#0a5c36', collar: '#c9a227' } },
  { id: 'SAL', name: 'Sale Sharks', short: 'SAL', strength: 78, region: 'celtic',
    kit: { primary: '#0b2a5b', secondary: '#4aa3df', accent: '#ffffff', pattern: 'shoulders', shorts: '#0b2a5b', socks: '#0b2a5b', collar: '#4aa3df' } },
];

export const PREM_CLUBS = CLUBS.map((c) => c.id);

/** School sides (private build): Quick Match only, not in the club or nation competitions. */
export const SCHOOLS: Nation[] = [
  // Bristol Grammar School U16A: claret shirt, navy shorts and socks
  { id: 'BGS', name: 'BGS U16', short: 'BGS', strength: 62, region: 'anglo',
    kit: { primary: '#6d1830', secondary: '#1c2452', accent: '#ffffff', pattern: 'plain', shorts: '#1c2452', socks: '#1c2452', collar: '#ffffff' } },
];
export const LEAGUE_NORTH = ['ENG', 'FRA', 'IRE', 'ITA', 'SCO', 'WAL'];
export const LEAGUE_SOUTH = ['NZL', 'RSA', 'AUS', 'ARG', 'FIJ', 'JPN'];

/** The user's own club in Squad Builder. */
export const CLUB_ID = 'CLB';
export const CLUB_NATION: Nation = {
  id: CLUB_ID,
  name: 'Try Line XV',
  short: 'TLX',
  strength: 70,
  region: 'anglo',
  kit: { primary: '#101418', secondary: '#c6ff1a', accent: '#21e6c1', pattern: 'chevron', shorts: '#101418', socks: '#c6ff1a' },
};

export function nationById(id: string): Nation {
  if (id === CLUB_ID) return CLUB_NATION;
  return NATIONS.find((n) => n.id === id) ?? CLUBS.find((n) => n.id === id) ?? SCHOOLS.find((n) => n.id === id) ?? NATIONS[0];
}

export const CHAMPIONSHIP_NATIONS = ['ENG', 'FRA', 'IRE', 'ITA', 'SCO', 'WAL'];
