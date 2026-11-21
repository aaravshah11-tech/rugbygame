/**
 * Nations use real country names only. Kits are original designs in each nation's colours,
 * with no logos or crests.
 */
export type KitPattern = 'plain' | 'hoops' | 'stripes' | 'sash' | 'chevron' | 'halves' | 'shoulders' | 'zigzag' | 'band';

export interface Kit {
  primary: string;
  secondary: string;
  accent: string;
  pattern: KitPattern;
  shorts: string;
  socks: string;
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
    kit: { primary: '#f4f5f7', secondary: '#1b2a5c', accent: '#d81e3a', pattern: 'chevron', shorts: '#f4f5f7', socks: '#1b2a5c' } },
  { id: 'WAL', name: 'Wales', short: 'WAL', strength: 80, region: 'celtic',
    kit: { primary: '#c8102e', secondary: '#ffffff', accent: '#00843d', pattern: 'sash', shorts: '#ffffff', socks: '#c8102e' } },
  { id: 'SCO', name: 'Scotland', short: 'SCO', strength: 82, region: 'celtic',
    kit: { primary: '#14214d', secondary: '#ffffff', accent: '#7a4fbf', pattern: 'shoulders', shorts: '#ffffff', socks: '#14214d' } },
  { id: 'IRE', name: 'Ireland', short: 'IRE', strength: 87, region: 'celtic',
    kit: { primary: '#0b7a3e', secondary: '#ffffff', accent: '#7ad14b', pattern: 'band', shorts: '#ffffff', socks: '#0b7a3e' } },
  { id: 'FRA', name: 'France', short: 'FRA', strength: 87, region: 'french',
    kit: { primary: '#1b2f7a', secondary: '#ffffff', accent: '#e4202e', pattern: 'halves', shorts: '#ffffff', socks: '#e4202e' } },
  { id: 'ITA', name: 'Italy', short: 'ITA', strength: 76, region: 'italian',
    kit: { primary: '#1f6fd1', secondary: '#ffffff', accent: '#0a9f4b', pattern: 'stripes', shorts: '#ffffff', socks: '#1f6fd1' } },
  { id: 'NZL', name: 'New Zealand', short: 'NZL', strength: 89, region: 'maori',
    kit: { primary: '#0b0b0d', secondary: '#f2f2f2', accent: '#5b5f66', pattern: 'zigzag', shorts: '#0b0b0d', socks: '#0b0b0d' } },
  { id: 'RSA', name: 'South Africa', short: 'RSA', strength: 89, region: 'afrikaans',
    kit: { primary: '#0b5a35', secondary: '#f6b81a', accent: '#f6b81a', pattern: 'shoulders', shorts: '#ffffff', socks: '#0b5a35' } },
  { id: 'AUS', name: 'Australia', short: 'AUS', strength: 82, region: 'anglo',
    kit: { primary: '#f7c600', secondary: '#0c5c3a', accent: '#0c5c3a', pattern: 'chevron', shorts: '#0c5c3a', socks: '#f7c600' } },
  { id: 'ARG', name: 'Argentina', short: 'ARG', strength: 82, region: 'latin',
    kit: { primary: '#7cc7f2', secondary: '#ffffff', accent: '#14214d', pattern: 'stripes', shorts: '#14214d', socks: '#7cc7f2' } },
  { id: 'FIJ', name: 'Fiji', short: 'FIJ', strength: 79, region: 'pacific',
    kit: { primary: '#ffffff', secondary: '#111111', accent: '#1aa6b7', pattern: 'zigzag', shorts: '#111111', socks: '#ffffff' } },
  { id: 'JPN', name: 'Japan', short: 'JPN', strength: 78, region: 'japanese',
    kit: { primary: '#d3122f', secondary: '#ffffff', accent: '#151b3a', pattern: 'hoops', shorts: '#151b3a', socks: '#d3122f' } },
  { id: 'TGA', name: 'Tonga', short: 'TGA', strength: 74, region: 'pacific',
    kit: { primary: '#b5121b', secondary: '#ffffff', accent: '#ffffff', pattern: 'sash', shorts: '#ffffff', socks: '#b5121b' } },
  { id: 'SAM', name: 'Samoa', short: 'SAM', strength: 75, region: 'pacific',
    kit: { primary: '#1d3f9e', secondary: '#ffffff', accent: '#c8102e', pattern: 'band', shorts: '#1d3f9e', socks: '#1d3f9e' } },
];

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
  return NATIONS.find((n) => n.id === id) ?? NATIONS[0];
}

export const CHAMPIONSHIP_NATIONS = ['ENG', 'FRA', 'IRE', 'ITA', 'SCO', 'WAL'];
