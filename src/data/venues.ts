/**
 * Home grounds. Each is described by how many tiers each stand has, the roof, corners and
 * colours, which the stadium builder turns into geometry. "main" is the long side on the far
 * side of the broadcast camera, "opp" the near long side, "endL"/"endR" the two ends.
 */
export interface Venue {
  name: string;
  city: string;
  /** tiers per side (0 = no stand: grass bank or open) */
  tiers: { main: number; opp: number; endL: number; endR: number; corners: number };
  /** rows in the lower tier (smaller grounds have fewer) */
  lowerRows: number;
  /** roof over the stands, a closed roof over everything, or none */
  roof: 'stands' | 'closed' | 'none';
  /** which sides are roofed when roof = 'stands' (default all) */
  roofSides?: Partial<Record<'main' | 'opp' | 'endL' | 'endR' | 'corners', boolean>>;
  roofColor: string;
  /** 0..1; translucent roofs (Aviva, Sydney) let light through */
  roofOpacity?: number;
  /** seat colours: two alternating, or a mosaic palette */
  seats: string[];
  mosaic?: boolean;
  /** athletics track round the pitch */
  track?: string;
  /** big corner masts holding the roof (Cardiff) */
  masts?: boolean;
  /** floodlight towers in the corners (otherwise lights sit on the roof edge) */
  towers: boolean;
  /** what's on the ends with no stand */
  bank?: string;
  /** share of seats filled (fields: how busy the touchline is) */
  fill: number;
  /** 'fields' = a school ground: open fields, pavilion, no stands */
  kind?: 'stadium' | 'fields';
}

const V = (v: Venue) => v;

export const VENUES: Record<string, Venue> = {
  // ---- nations
  ENG: V({ name: 'Allianz Stadium', city: 'Twickenham', tiers: { main: 3, opp: 3, endL: 3, endR: 3, corners: 3 }, lowerRows: 16, roof: 'stands', roofColor: '#d9dde3', seats: ['#2a2f3a', '#323846'], towers: false, fill: 0.97 }),
  WAL: V({ name: 'Principality Stadium', city: 'Cardiff', tiers: { main: 3, opp: 3, endL: 3, endR: 3, corners: 3 }, lowerRows: 16, roof: 'closed', roofColor: '#c9ced6', seats: ['#9b1324', '#b0182b'], masts: true, towers: false, fill: 0.98 }),
  SCO: V({ name: 'Scottish Gas Murrayfield', city: 'Edinburgh', tiers: { main: 2, opp: 2, endL: 1, endR: 1, corners: 1 }, lowerRows: 18, roof: 'stands', roofColor: '#c8ccd2', seats: ['#14214d', '#1b2b5e'], towers: false, fill: 0.95 }),
  IRE: V({ name: 'Aviva Stadium', city: 'Dublin', tiers: { main: 3, opp: 3, endL: 1, endR: 3, corners: 2 }, lowerRows: 16, roof: 'stands', roofColor: '#dfe7ef', roofOpacity: 0.55, seats: ['#5a5f68', '#676c75'], towers: false, fill: 0.97 }),
  FRA: V({ name: 'Stade de France', city: 'Saint-Denis', tiers: { main: 3, opp: 3, endL: 3, endR: 3, corners: 3 }, lowerRows: 16, roof: 'stands', roofColor: '#bfc6cf', roofOpacity: 0.8, seats: ['#1e3a8a', '#24429a'], towers: false, fill: 0.96 }),
  ITA: V({ name: 'Stadio Olimpico', city: 'Rome', tiers: { main: 2, opp: 2, endL: 2, endR: 2, corners: 2 }, lowerRows: 14, roof: 'stands', roofColor: '#eef1f4', roofOpacity: 0.75, seats: ['#3b82c4', '#4a90d0'], track: '#2f5fa8', towers: false, fill: 0.8 }),
  NZL: V({ name: 'Eden Park', city: 'Auckland', tiers: { main: 2, opp: 2, endL: 1, endR: 1, corners: 0 }, lowerRows: 16, roof: 'stands', roofSides: { main: true, opp: true, endL: false, endR: false }, roofColor: '#cfd3d8', seats: ['#1b1d22', '#25282e'], towers: true, bank: '#2f5a26', fill: 0.97 }),
  RSA: V({ name: 'Ellis Park', city: 'Johannesburg', tiers: { main: 2, opp: 2, endL: 2, endR: 2, corners: 2 }, lowerRows: 16, roof: 'stands', roofSides: { main: true, opp: false, endL: false, endR: false, corners: false }, roofColor: '#c4c8cf', seats: ['#0b5a35', '#0f6a3f'], towers: true, fill: 0.95 }),
  AUS: V({ name: 'Allianz Stadium', city: 'Sydney', tiers: { main: 2, opp: 2, endL: 2, endR: 2, corners: 2 }, lowerRows: 16, roof: 'stands', roofColor: '#e7ecf2', roofOpacity: 0.55, seats: ['#1c3f78', '#244a88'], towers: false, fill: 0.93 }),
  ARG: V({ name: 'Estadio José Amalfitani', city: 'Buenos Aires', tiers: { main: 2, opp: 2, endL: 1, endR: 1, corners: 1 }, lowerRows: 16, roof: 'stands', roofSides: { main: true, opp: false, endL: false, endR: false, corners: false }, roofColor: '#c6cbd2', seats: ['#2b4f8a', '#e6edf5'], towers: true, fill: 0.95 }),
  FIJ: V({ name: 'HFC Bank Stadium', city: 'Suva', tiers: { main: 2, opp: 1, endL: 0, endR: 0, corners: 0 }, lowerRows: 10, roof: 'stands', roofSides: { main: true, opp: false }, roofColor: '#d0d4da', seats: ['#3d4553', '#4a5262'], towers: true, bank: '#3b6b2b', fill: 0.92 }),
  JPN: V({ name: 'Japan National Stadium', city: 'Tokyo', tiers: { main: 3, opp: 3, endL: 3, endR: 3, corners: 3 }, lowerRows: 16, roof: 'stands', roofColor: '#9a6b3e', seats: ['#3f6b3a', '#8a6a3c', '#d8d2c2', '#2d4a2c', '#6e5a3a', '#bfb59c'], mosaic: true, towers: false, fill: 0.92 }),
  TGA: V({ name: 'Teufaiva Sport Stadium', city: "Nuku'alofa", tiers: { main: 1, opp: 0, endL: 0, endR: 0, corners: 0 }, lowerRows: 9, roof: 'stands', roofSides: { main: true }, roofColor: '#c9cdd3', seats: ['#9b1c24', '#b0242c'], towers: true, bank: '#3b6b2b', fill: 0.9 }),
  SAM: V({ name: 'Apia Park', city: 'Apia', tiers: { main: 1, opp: 1, endL: 0, endR: 0, corners: 0 }, lowerRows: 9, roof: 'stands', roofSides: { main: true }, roofColor: '#c9cdd3', seats: ['#1d3f9e', '#2449ad'], towers: true, bank: '#3b6b2b', fill: 0.9 }),
  // ---- Premiership grounds
  BTH: V({ name: 'The Rec', city: 'Bath', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 11, roof: 'stands', roofSides: { main: true, opp: false, endL: true, endR: false }, roofColor: '#d0d5db', seats: ['#1f3f8f', '#263f7a'], towers: true, fill: 0.98 }),
  BRS: V({ name: 'Ashton Gate', city: 'Bristol', tiers: { main: 2, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 14, roof: 'stands', roofColor: '#cfd4da', seats: ['#14254f', '#c8102e'], towers: false, fill: 0.9 }),
  EXE: V({ name: 'Sandy Park', city: 'Exeter', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 13, roof: 'stands', roofColor: '#cdd2d8', seats: ['#111214', '#1b1c20'], towers: true, fill: 0.95 }),
  GLO: V({ name: 'Kingsholm', city: 'Gloucester', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 12, roof: 'stands', roofSides: { main: true, opp: true, endL: false, endR: true }, roofColor: '#c7ccd2', seats: ['#9c1028', '#e9e9ea'], towers: true, fill: 0.98 }),
  LEI: V({ name: 'Mattioli Woods Welford Road', city: 'Leicester', tiers: { main: 3, opp: 2, endL: 1, endR: 1, corners: 0 }, lowerRows: 14, roof: 'stands', roofColor: '#cbd0d6', seats: ['#0f6b3a', '#c8102e'], towers: false, fill: 0.97 }),
  LDN: V({ name: 'StoneX Stadium', city: 'London', tiers: { main: 1, opp: 1, endL: 1, endR: 0, corners: 0 }, lowerRows: 11, roof: 'stands', roofSides: { main: true, opp: false, endL: false }, roofColor: '#c7ccd2', seats: ['#111111', '#c8102e'], towers: true, bank: '#2f5a26', fill: 0.9 }),
  LDW: V({ name: 'Twickenham Stoop', city: 'London', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 12, roof: 'stands', roofColor: '#ccd1d7', seats: ['#5aa9d6', '#8c1d40'], towers: true, fill: 0.95 }),
  NEW: V({ name: 'Kingston Park', city: 'Newcastle', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 10, roof: 'stands', roofColor: '#c9ced4', seats: ['#0d1b3e', '#d4002a'], towers: true, fill: 0.85 }),
  NOR: V({ name: "cinch Stadium at Franklin's Gardens", city: 'Northampton', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 1 }, lowerRows: 14, roof: 'stands', roofColor: '#ccd1d7', seats: ['#0a5c36', '#c9a227'], towers: false, fill: 0.97 }),
  // ---- schools
  BGS: V({ name: 'Failand Sports Fields', city: 'Bristol', kind: 'fields', tiers: { main: 0, opp: 0, endL: 0, endR: 0, corners: 0 }, lowerRows: 0, roof: 'none', roofColor: '#cfd4da', seats: ['#6d1830', '#1c2452'], towers: false, fill: 0.5 }),
  SAL: V({ name: 'Salford Community Stadium', city: 'Salford', tiers: { main: 1, opp: 1, endL: 1, endR: 1, corners: 0 }, lowerRows: 12, roof: 'stands', roofColor: '#ccd1d7', seats: ['#0b2a5b', '#4aa3df'], towers: true, fill: 0.88 }),
};

export const DEFAULT_VENUE = VENUES.ENG;

export function venueFor(teamId: string): Venue {
  return VENUES[teamId] ?? DEFAULT_VENUE;
}
