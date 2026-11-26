/**
 * Real-world sponsors (private build, never published): 99 brands. Logos come from simple-icons where the
 * brand is there (see SI_ICONS in src/sponsors/icons.ts); everything else is drawn as a wordmark
 * in the brand's colours. Drop your own logo into public/sponsors/<id>.svg or .png to override.
 */
export type SponsorCategory = 'rugby' | 'kit' | 'sport' | 'drink' | 'car' | 'tech' | 'finance' | 'airline' | 'broadcast' | 'lifestyle';
export type SponsorTier = 'title' | 'premium' | 'standard';
export type Placement = 'boards' | 'shirts' | 'pitch' | 'screens' | 'menus' | 'hud' | 'posts' | 'broadcast';

export interface Wordmark {
  /** CSS font stack */
  font: string;
  weight: number;
  italic?: boolean;
  /** text as it should read (case matters) */
  text?: string;
  /** letter spacing in em */
  tracking?: number;
}

export interface Sponsor {
  id: string;
  name: string;
  category: SponsorCategory;
  /** primary = logo colour, secondary = accent, bg = panel colour on boards */
  colors: { primary: string; secondary: string; bg: string };
  /** simple-icons slug, when the brand is there */
  icon?: string;
  /** add the name beside a symbol-only icon (e.g. the swoosh) */
  withName?: boolean;
  wordmark?: Wordmark;
  tier: SponsorTier;
  where: Placement[];
  /** home sides that feature this brand more (local partners) */
  local?: string[];
}

const SANS = '"Helvetica Neue", Arial, sans-serif';
const BLACK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const ALL: Placement[] = ['boards', 'pitch', 'screens', 'menus', 'hud', 'posts', 'broadcast'];
const BOARD: Placement[] = ['boards', 'screens'];
const BOARD_PITCH: Placement[] = ['boards', 'screens', 'pitch'];
const SHIRT: Placement[] = ['boards', 'screens', 'shirts'];

const S = (s: Sponsor) => s;

export const SPONSORS: Sponsor[] = [
  // ------------------------------------------------------------------ rugby & competition
  S({ id: 'guinness', name: 'Guinness', category: 'rugby', colors: { primary: '#d4b36a', secondary: '#ffffff', bg: '#111111' }, wordmark: { font: SERIF, weight: 700, text: 'GUINNESS', tracking: 0.06 }, tier: 'title', where: ALL, local: ['IRE'] }),
  S({ id: 'gallagher', name: 'Gallagher', category: 'rugby', colors: { primary: '#ffffff', secondary: '#c8a24a', bg: '#00205b' }, wordmark: { font: SANS, weight: 800, text: 'Gallagher' }, tier: 'title', where: ALL }),
  S({ id: 'allianz', name: 'Allianz', category: 'finance', colors: { primary: '#ffffff', secondary: '#3db2e6', bg: '#003781' }, wordmark: { font: SANS, weight: 700, text: 'Allianz' }, tier: 'title', where: ALL, local: ['ENG', 'LDN'] }),
  S({ id: 'heineken', name: 'Heineken', category: 'drink', colors: { primary: '#ffffff', secondary: '#e2001a', bg: '#00843d' }, wordmark: { font: SANS, weight: 800, text: 'Heineken', italic: true }, tier: 'title', where: ALL }),
  S({ id: 'mastercard', name: 'Mastercard', category: 'finance', colors: { primary: '#eb001b', secondary: '#f79e1b', bg: '#ffffff' }, icon: 'mastercard', withName: true, tier: 'title', where: ALL }),
  S({ id: 'emirates', name: 'Emirates', category: 'airline', colors: { primary: '#d71921', secondary: '#ffffff', bg: '#ffffff' }, icon: 'emirates', withName: true, tier: 'title', where: ALL }),
  S({ id: 'flyemirates', name: 'Fly Emirates', category: 'airline', colors: { primary: '#ffffff', secondary: '#d71921', bg: '#d71921' }, icon: 'flyemirates', withName: true, wordmark: { font: SERIF, weight: 700, text: 'Fly Emirates', italic: true }, tier: 'premium', where: ['boards', 'screens', 'shirts'] }),
  S({ id: 'dhl', name: 'DHL', category: 'rugby', colors: { primary: '#d40511', secondary: '#ffcc00', bg: '#ffcc00' }, icon: 'dhl', tier: 'premium', where: BOARD_PITCH }),
  S({ id: 'landrover', name: 'Land Rover', category: 'car', colors: { primary: '#ffffff', secondary: '#005a2b', bg: '#005a2b' }, icon: 'landrover', wordmark: { font: SANS, weight: 700, text: 'LAND ROVER', tracking: 0.12 }, tier: 'premium', where: BOARD_PITCH, local: ['ENG'] }),
  S({ id: 'rolex', name: 'Rolex', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#a37e2c', bg: '#006039' }, wordmark: { font: SERIF, weight: 400, text: 'ROLEX', tracking: 0.18 }, tier: 'premium', where: ['boards', 'screens', 'hud', 'broadcast'] }),
  S({ id: 'tudor', name: 'TUDOR', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#c8102e', bg: '#c8102e' }, wordmark: { font: SERIF, weight: 400, text: 'TUDOR', tracking: 0.2 }, tier: 'premium', where: ['boards', 'screens', 'hud'] }),
  S({ id: 'peugeot', name: 'Peugeot', category: 'car', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'peugeot', withName: true, tier: 'premium', where: SHIRT.concat('pitch'), local: ['FRA', 'SCO', 'ARG'] }),
  S({ id: 'bupa', name: 'Bupa', category: 'finance', colors: { primary: '#ffffff', secondary: '#0079c8', bg: '#0079c8' }, wordmark: { font: SANS, weight: 800, text: 'Bupa' }, tier: 'standard', where: SHIRT }),
  S({ id: 'castore', name: 'Castore', category: 'kit', colors: { primary: '#ffffff', secondary: '#c9a227', bg: '#111111' }, wordmark: { font: SANS, weight: 600, text: 'CASTORE', tracking: 0.3 }, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'canterbury', name: 'Canterbury', category: 'kit', colors: { primary: '#ffffff', secondary: '#0b2240', bg: '#0b2240' }, wordmark: { font: SANS, weight: 800, text: 'CANTERBURY', tracking: 0.08 }, tier: 'standard', where: ['boards', 'shirts', 'menus'] }),
  S({ id: 'gilbert', name: 'Gilbert', category: 'rugby', colors: { primary: '#ffffff', secondary: '#e30613', bg: '#e30613' }, wordmark: { font: SCRIPTISH(), weight: 800, text: 'Gilbert', italic: true }, tier: 'premium', where: ['boards', 'screens', 'menus', 'pitch'] }),
  S({ id: 'vodafone', name: 'Vodafone', category: 'tech', colors: { primary: '#e60000', secondary: '#ffffff', bg: '#ffffff' }, icon: 'vodafone', withName: true, tier: 'premium', where: SHIRT.concat('pitch'), local: ['IRE', 'WAL', 'RSA'] }),
  S({ id: 'o2', name: 'O2', category: 'tech', colors: { primary: '#ffffff', secondary: '#0050ff', bg: '#0050ff' }, icon: 'o2', tier: 'premium', where: SHIRT.concat('pitch'), local: ['ENG'] }),
  S({ id: 'altrad', name: 'Altrad', category: 'rugby', colors: { primary: '#ffffff', secondary: '#e30613', bg: '#e30613' }, wordmark: { font: BLACK, weight: 900, text: 'ALTRAD' }, tier: 'standard', where: SHIRT, local: ['FRA'] }),
  S({ id: 'qantas', name: 'Qantas', category: 'airline', colors: { primary: '#ffffff', secondary: '#e40000', bg: '#e40000' }, icon: 'qantas', withName: true, tier: 'premium', where: SHIRT.concat('pitch'), local: ['AUS'] }),
  S({ id: 'toyota', name: 'Toyota', category: 'car', colors: { primary: '#eb0a1e', secondary: '#ffffff', bg: '#ffffff' }, icon: 'toyota', withName: true, tier: 'premium', where: SHIRT.concat('pitch'), local: ['JPN', 'FIJ', 'TGA', 'AUS'] }),
  S({ id: 'asahi', name: 'Asahi', category: 'drink', colors: { primary: '#ffffff', secondary: '#c0c4c8', bg: '#14213d' }, wordmark: { font: BLACK, weight: 900, text: 'Asahi', italic: true }, tier: 'standard', where: BOARD, local: ['JPN', 'AUS'] }),
  // ------------------------------------------------------------------ kit & sportswear
  S({ id: 'adidas', name: 'adidas', category: 'kit', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'adidas', withName: true, tier: 'premium', where: ['boards', 'shirts', 'screens'], local: ['NZL'] }),
  S({ id: 'nike', name: 'Nike', category: 'kit', colors: { primary: '#ffffff', secondary: '#111111', bg: '#111111' }, icon: 'nike', tier: 'premium', where: ['boards', 'shirts', 'screens'], local: ['RSA'] }),
  S({ id: 'puma', name: 'PUMA', category: 'kit', colors: { primary: '#ffffff', secondary: '#242b2f', bg: '#242b2f' }, icon: 'puma', withName: true, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'underarmour', name: 'Under Armour', category: 'kit', colors: { primary: '#ffffff', secondary: '#1d1d1d', bg: '#1d1d1d' }, icon: 'underarmour', withName: true, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'asics', name: 'ASICS', category: 'kit', colors: { primary: '#ffffff', secondary: '#001e62', bg: '#001e62' }, wordmark: { font: BLACK, weight: 900, text: 'asics', italic: true }, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'umbro', name: 'Umbro', category: 'kit', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, wordmark: { font: SANS, weight: 800, text: 'umbro' }, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'macron', name: 'Macron', category: 'kit', colors: { primary: '#ffffff', secondary: '#0a2240', bg: '#0a2240' }, wordmark: { font: BLACK, weight: 900, text: 'macron' }, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'lecoqsportif', name: 'Le Coq Sportif', category: 'kit', colors: { primary: '#ffffff', secondary: '#002654', bg: '#002654' }, wordmark: { font: SANS, weight: 700, text: 'le coq sportif', italic: true }, tier: 'standard', where: ['boards', 'shirts'], local: ['FRA'] }),
  S({ id: 'kappa', name: 'Kappa', category: 'kit', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, wordmark: { font: BLACK, weight: 900, text: 'Kappa' }, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'newbalance', name: 'New Balance', category: 'kit', colors: { primary: '#cf0a2c', secondary: '#ffffff', bg: '#ffffff' }, icon: 'newbalance', withName: true, tier: 'standard', where: ['boards', 'shirts'] }),
  S({ id: 'mizuno', name: 'Mizuno', category: 'kit', colors: { primary: '#ffffff', secondary: '#001489', bg: '#001489' }, wordmark: { font: BLACK, weight: 900, text: 'Mizuno', italic: true }, tier: 'standard', where: ['boards', 'shirts'], local: ['JPN'] }),
  S({ id: 'oakley', name: 'Oakley', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#e4002b', bg: '#000000' }, wordmark: { font: SANS, weight: 800, text: 'OAKLEY', tracking: 0.2 }, tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ drinks & food
  S({ id: 'lucozade', name: 'Lucozade Sport', category: 'drink', colors: { primary: '#ffffff', secondary: '#ffd200', bg: '#e4002b' }, wordmark: { font: BLACK, weight: 900, text: 'LUCOZADE SPORT', italic: true }, tier: 'premium', where: BOARD_PITCH, local: ['ENG', 'WAL'] }),
  S({ id: 'gatorade', name: 'Gatorade', category: 'drink', colors: { primary: '#ffffff', secondary: '#f47b20', bg: '#000000' }, wordmark: { font: BLACK, weight: 900, text: 'GATORADE', italic: true }, tier: 'standard', where: BOARD }),
  S({ id: 'powerade', name: 'Powerade', category: 'drink', colors: { primary: '#ffffff', secondary: '#00a3e0', bg: '#1d2b55' }, wordmark: { font: BLACK, weight: 900, text: 'POWERADE', italic: true }, tier: 'standard', where: BOARD }),
  S({ id: 'redbull', name: 'Red Bull', category: 'drink', colors: { primary: '#db0a40', secondary: '#ffcc00', bg: '#001e50' }, icon: 'redbull', withName: true, tier: 'premium', where: SHIRT.concat('pitch', 'menus'), local: ['NEW'] }),
  S({ id: 'monster', name: 'Monster Energy', category: 'drink', colors: { primary: '#95d600', secondary: '#ffffff', bg: '#000000' }, wordmark: { font: BLACK, weight: 900, text: 'MONSTER', italic: true, tracking: 0.04 }, tier: 'standard', where: SHIRT }),
  S({ id: 'cocacola', name: 'Coca-Cola', category: 'drink', colors: { primary: '#ffffff', secondary: '#f40009', bg: '#f40009' }, icon: 'cocacola', tier: 'premium', where: SHIRT.concat('pitch') }),
  S({ id: 'pepsi', name: 'Pepsi', category: 'drink', colors: { primary: '#ffffff', secondary: '#2151a1', bg: '#004b93' }, icon: 'pepsi', withName: true, wordmark: { font: SANS, weight: 800, text: 'pepsi' }, tier: 'standard', where: BOARD }),
  S({ id: 'heinz', name: 'Heinz', category: 'drink', colors: { primary: '#ffffff', secondary: '#2e6d2a', bg: '#c8102e' }, wordmark: { font: SERIF, weight: 700, text: 'HEINZ', italic: true }, tier: 'standard', where: BOARD }),
  S({ id: 'mcdonalds', name: "McDonald's", category: 'drink', colors: { primary: '#ffc72c', secondary: '#da291c', bg: '#da291c' }, icon: 'mcdonalds', withName: true, tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ cars
  S({ id: 'bmw', name: 'BMW', category: 'car', colors: { primary: '#0066b1', secondary: '#ffffff', bg: '#ffffff' }, icon: 'bmw', withName: true, tier: 'premium', where: BOARD_PITCH }),
  S({ id: 'mercedes', name: 'Mercedes-Benz', category: 'car', colors: { primary: '#ffffff', secondary: '#242424', bg: '#000000' }, icon: 'mercedes', withName: true, wordmark: { font: SERIF, weight: 400, text: 'Mercedes-Benz' }, tier: 'premium', where: BOARD_PITCH }),
  S({ id: 'audi', name: 'Audi', category: 'car', colors: { primary: '#ffffff', secondary: '#bb0a30', bg: '#000000' }, icon: 'audi', withName: true, tier: 'premium', where: BOARD }),
  S({ id: 'jaguar', name: 'Jaguar', category: 'car', colors: { primary: '#ffffff', secondary: '#9c8f6e', bg: '#1a1a1a' }, icon: 'jaguar', wordmark: { font: SANS, weight: 300, text: 'JAGUAR', tracking: 0.35 }, tier: 'standard', where: BOARD, local: ['ENG'] }),
  S({ id: 'porsche', name: 'Porsche', category: 'car', colors: { primary: '#ffffff', secondary: '#b12b28', bg: '#000000' }, icon: 'porsche', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'lamborghini', name: 'Lamborghini', category: 'car', colors: { primary: '#d1a33f', secondary: '#000000', bg: '#000000' }, icon: 'lamborghini', withName: true, tier: 'standard', where: BOARD, local: ['ITA'] }),
  S({ id: 'ferrari', name: 'Ferrari', category: 'car', colors: { primary: '#ffeb00', secondary: '#000000', bg: '#d40000' }, icon: 'ferrari', withName: true, tier: 'standard', where: BOARD, local: ['ITA'] }),
  S({ id: 'mclaren', name: 'McLaren', category: 'car', colors: { primary: '#ff8000', secondary: '#ffffff', bg: '#111111' }, icon: 'mclaren', tier: 'standard', where: BOARD }),
  S({ id: 'tesla', name: 'Tesla', category: 'car', colors: { primary: '#ffffff', secondary: '#cc0000', bg: '#cc0000' }, icon: 'tesla', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'volvo', name: 'Volvo', category: 'car', colors: { primary: '#ffffff', secondary: '#003057', bg: '#003057' }, icon: 'volvo', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'ford', name: 'Ford', category: 'car', colors: { primary: '#ffffff', secondary: '#00274e', bg: '#00274e' }, icon: 'ford', tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ tech & gaming
  S({ id: 'apple', name: 'Apple', category: 'tech', colors: { primary: '#ffffff', secondary: '#a2aaad', bg: '#000000' }, icon: 'apple', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'samsung', name: 'Samsung', category: 'tech', colors: { primary: '#ffffff', secondary: '#1428a0', bg: '#1428a0' }, icon: 'samsung', tier: 'premium', where: BOARD_PITCH }),
  S({ id: 'sony', name: 'Sony', category: 'tech', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'sony', tier: 'standard', where: BOARD, local: ['JPN'] }),
  S({ id: 'playstation', name: 'PlayStation', category: 'tech', colors: { primary: '#ffffff', secondary: '#0070d1', bg: '#0070d1' }, icon: 'playstation', withName: true, tier: 'premium', where: BOARD.concat('menus'), local: ['JPN'] }),
  S({ id: 'xbox', name: 'Xbox', category: 'tech', colors: { primary: '#ffffff', secondary: '#107c10', bg: '#107c10' }, icon: 'xbox', withName: true, wordmark: { font: SANS, weight: 800, text: 'XBOX', tracking: 0.12 }, tier: 'standard', where: BOARD }),
  S({ id: 'nintendo', name: 'Nintendo', category: 'tech', colors: { primary: '#ffffff', secondary: '#e60012', bg: '#e60012' }, icon: 'nintendo', wordmark: { font: SANS, weight: 800, text: 'Nintendo' }, tier: 'standard', where: BOARD, local: ['JPN'] }),
  S({ id: 'google', name: 'Google', category: 'tech', colors: { primary: '#4285f4', secondary: '#ea4335', bg: '#ffffff' }, icon: 'google', withName: true, tier: 'premium', where: BOARD }),
  S({ id: 'spotify', name: 'Spotify', category: 'tech', colors: { primary: '#1ed760', secondary: '#ffffff', bg: '#121212' }, icon: 'spotify', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'beats', name: 'Beats', category: 'tech', colors: { primary: '#ffffff', secondary: '#e01f3d', bg: '#e01f3d' }, icon: 'beatsbydre', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'bose', name: 'Bose', category: 'tech', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'bose', tier: 'standard', where: BOARD }),
  S({ id: 'easports', name: 'EA SPORTS', category: 'tech', colors: { primary: '#ffffff', secondary: '#ff4747', bg: '#000000' }, icon: 'ea', withName: true, wordmark: { font: BLACK, weight: 900, text: 'SPORTS', italic: true }, tier: 'premium', where: BOARD.concat('menus') }),
  S({ id: 'microsoft', name: 'Microsoft', category: 'tech', colors: { primary: '#737373', secondary: '#00a4ef', bg: '#ffffff' }, wordmark: { font: SANS, weight: 600, text: 'Microsoft' }, tier: 'standard', where: BOARD }),
  S({ id: 'dell', name: 'Dell', category: 'tech', colors: { primary: '#ffffff', secondary: '#007db8', bg: '#007db8' }, icon: 'dell', tier: 'standard', where: BOARD }),
  S({ id: 'lenovo', name: 'Lenovo', category: 'tech', colors: { primary: '#ffffff', secondary: '#e2231a', bg: '#e2231a' }, icon: 'lenovo', tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ broadcast & media
  S({ id: 'skysports', name: 'Sky Sports', category: 'broadcast', colors: { primary: '#ffffff', secondary: '#ff0000', bg: '#0a1f5c' }, icon: 'sky', withName: true, wordmark: { font: BLACK, weight: 900, text: 'SPORTS', italic: true }, tier: 'premium', where: ['boards', 'screens', 'hud', 'broadcast'] }),
  S({ id: 'tntsports', name: 'TNT Sports', category: 'broadcast', colors: { primary: '#ffffff', secondary: '#e4002b', bg: '#000000' }, wordmark: { font: BLACK, weight: 900, text: 'TNT SPORTS' }, tier: 'premium', where: ['boards', 'screens', 'hud', 'broadcast'] }),
  S({ id: 'itv', name: 'ITV', category: 'broadcast', colors: { primary: '#ffffff', secondary: '#deeb52', bg: '#0a0a32' }, icon: 'itv', wordmark: { font: BLACK, weight: 900, text: 'ITV' }, tier: 'standard', where: ['boards', 'screens', 'broadcast'] }),
  S({ id: 'bbcsport', name: 'BBC Sport', category: 'broadcast', colors: { primary: '#ffffff', secondary: '#ffd230', bg: '#000000' }, icon: 'bbcsport', withName: true, wordmark: { font: SANS, weight: 800, text: 'SPORT', tracking: 0.08 }, tier: 'standard', where: ['boards', 'screens', 'broadcast'] }),
  S({ id: 'primevideo', name: 'Prime Video', category: 'broadcast', colors: { primary: '#ffffff', secondary: '#00a8e1', bg: '#0f171e' }, icon: 'primevideo', wordmark: { font: SANS, weight: 700, text: 'prime video' }, tier: 'standard', where: BOARD }),
  S({ id: 'netflix', name: 'Netflix', category: 'broadcast', colors: { primary: '#e50914', secondary: '#ffffff', bg: '#000000' }, icon: 'netflix', withName: true, tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ finance & business
  S({ id: 'visa', name: 'Visa', category: 'finance', colors: { primary: '#ffffff', secondary: '#f7b600', bg: '#1a1f71' }, icon: 'visa', tier: 'premium', where: BOARD_PITCH }),
  S({ id: 'amex', name: 'American Express', category: 'finance', colors: { primary: '#2e77bc', secondary: '#ffffff', bg: '#ffffff' }, icon: 'americanexpress', tier: 'standard', where: BOARD }),
  S({ id: 'paypal', name: 'PayPal', category: 'finance', colors: { primary: '#ffffff', secondary: '#009cde', bg: '#003087' }, icon: 'paypal', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'hsbc', name: 'HSBC', category: 'finance', colors: { primary: '#db0011', secondary: '#000000', bg: '#ffffff' }, icon: 'hsbc', withName: true, tier: 'premium', where: BOARD_PITCH, local: ['ENG'] }),
  S({ id: 'barclays', name: 'Barclays', category: 'finance', colors: { primary: '#ffffff', secondary: '#00aeef', bg: '#00395d' }, icon: 'barclays', withName: true, tier: 'standard', where: SHIRT, local: ['ENG', 'SAL'] }),
  S({ id: 'santander', name: 'Santander', category: 'finance', colors: { primary: '#ffffff', secondary: '#ec0000', bg: '#ec0000' }, wordmark: { font: SANS, weight: 700, text: 'Santander' }, tier: 'standard', where: BOARD }),
  S({ id: 'revolut', name: 'Revolut', category: 'finance', colors: { primary: '#ffffff', secondary: '#0666eb', bg: '#191c1f' }, icon: 'revolut', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'monzo', name: 'Monzo', category: 'finance', colors: { primary: '#ff4f40', secondary: '#ffffff', bg: '#14233c' }, icon: 'monzo', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'deloitte', name: 'Deloitte', category: 'finance', colors: { primary: '#ffffff', secondary: '#86bc25', bg: '#000000' }, wordmark: { font: SANS, weight: 700, text: 'Deloitte.' }, tier: 'standard', where: BOARD }),
  S({ id: 'accenture', name: 'Accenture', category: 'finance', colors: { primary: '#a100ff', secondary: '#ffffff', bg: '#ffffff' }, icon: 'accenture', withName: true, tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ airlines & travel
  S({ id: 'britishairways', name: 'British Airways', category: 'airline', colors: { primary: '#ffffff', secondary: '#eb2226', bg: '#075aaa' }, icon: 'britishairways', withName: true, tier: 'premium', where: BOARD_PITCH, local: ['ENG'] }),
  S({ id: 'virginatlantic', name: 'Virgin Atlantic', category: 'airline', colors: { primary: '#ffffff', secondary: '#da0530', bg: '#da0530' }, icon: 'virginatlantic', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'airnz', name: 'Air New Zealand', category: 'airline', colors: { primary: '#ffffff', secondary: '#00b5ad', bg: '#000000' }, wordmark: { font: SANS, weight: 700, text: 'AIR NEW ZEALAND', tracking: 0.08 }, tier: 'premium', where: SHIRT.concat('pitch'), local: ['NZL'] }),
  S({ id: 'etihad', name: 'Etihad', category: 'airline', colors: { primary: '#bd8b13', secondary: '#ffffff', bg: '#2b2a29' }, icon: 'etihadairways', tier: 'standard', where: BOARD }),
  S({ id: 'airbnb', name: 'Airbnb', category: 'airline', colors: { primary: '#ffffff', secondary: '#ff5a5f', bg: '#ff5a5f' }, icon: 'airbnb', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'booking', name: 'Booking.com', category: 'airline', colors: { primary: '#ffffff', secondary: '#feba02', bg: '#003a9a' }, icon: 'bookingdotcom', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'uber', name: 'Uber', category: 'airline', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'uber', tier: 'standard', where: BOARD }),
  // ------------------------------------------------------------------ lifestyle & extras
  S({ id: 'omega', name: 'Omega', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#c8102e', bg: '#a2001d' }, wordmark: { font: SERIF, weight: 700, text: 'OMEGA', tracking: 0.12 }, tier: 'standard', where: BOARD }),
  S({ id: 'tagheuer', name: 'TAG Heuer', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#e30613', bg: '#007a5a' }, wordmark: { font: SANS, weight: 800, text: 'TAG HEUER', tracking: 0.08 }, tier: 'standard', where: ['boards', 'screens', 'hud'] }),
  S({ id: 'rayban', name: 'Ray-Ban', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#e2231a', bg: '#e2231a' }, wordmark: { font: SCRIPTISH(), weight: 800, text: 'Ray-Ban', italic: true }, tier: 'standard', where: BOARD }),
  S({ id: 'gopro', name: 'GoPro', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#00a8e1', bg: '#000000' }, wordmark: { font: BLACK, weight: 900, text: 'GoPro' }, tier: 'standard', where: BOARD }),
  S({ id: 'ralphlauren', name: 'Ralph Lauren', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#002147', bg: '#002147' }, wordmark: { font: SERIF, weight: 400, text: 'RALPH LAUREN', tracking: 0.14 }, tier: 'standard', where: BOARD }),
  S({ id: 'hugoboss', name: 'Hugo Boss', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, wordmark: { font: SANS, weight: 800, text: 'BOSS', tracking: 0.32 }, tier: 'standard', where: BOARD }),
  S({ id: 'northface', name: 'The North Face', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#000000', bg: '#000000' }, icon: 'thenorthface', withName: true, tier: 'standard', where: BOARD }),
  S({ id: 'supreme', name: 'Supreme', category: 'lifestyle', colors: { primary: '#ffffff', secondary: '#ed1c24', bg: '#ed1c24' }, wordmark: { font: 'Futura, "Century Gothic", Arial, sans-serif', weight: 800, text: 'Supreme', italic: true }, tier: 'standard', where: BOARD }),
];

function SCRIPTISH() {
  return '"Brush Script MT", "Segoe Script", Georgia, serif';
}

export const SPONSOR_BY_ID: Record<string, Sponsor> = Object.fromEntries(SPONSORS.map((s) => [s.id, s]));

/** Title sponsor for each competition / mode. */
export const COMP_TITLE: Record<string, string> = {
  six: 'guinness',
  league: 'mastercard',
  prem: 'gallagher',
  wc: 'emirates',
  quick: 'allianz',
  club: 'heineken',
  kick: 'gilbert',
  challenge: 'redbull',
  training: 'canterbury',
};

/** Kit makers and front-of-shirt sponsors (in the spirit of the real deals; game choices). */
export const TEAM_DEALS: Record<string, { kit: string; shirt?: string; sleeve?: string; partners: string[] }> = {
  ENG: { kit: 'castore', shirt: 'o2', sleeve: 'allianz', partners: ['o2', 'landrover', 'britishairways', 'hsbc', 'lucozade', 'barclays', 'jaguar'] },
  WAL: { kit: 'macron', shirt: 'vodafone', partners: ['vodafone', 'lucozade', 'heineken'] },
  SCO: { kit: 'macron', shirt: 'peugeot', partners: ['peugeot', 'dhl', 'bmw'] },
  IRE: { kit: 'canterbury', shirt: 'vodafone', partners: ['vodafone', 'guinness', 'bupa'] },
  FRA: { kit: 'lecoqsportif', shirt: 'altrad', partners: ['altrad', 'peugeot', 'heineken'] },
  ITA: { kit: 'macron', shirt: 'dhl', partners: ['ferrari', 'lamborghini', 'dhl'] },
  NZL: { kit: 'adidas', shirt: 'airnz', sleeve: 'gallagher', partners: ['airnz', 'adidas', 'gallagher'] },
  RSA: { kit: 'nike', shirt: 'vodafone', partners: ['vodafone', 'nike', 'dhl'] },
  AUS: { kit: 'castore', shirt: 'qantas', partners: ['qantas', 'toyota', 'asahi'] },
  ARG: { kit: 'nike', shirt: 'peugeot', partners: ['peugeot', 'nike'] },
  FIJ: { kit: 'kappa', shirt: 'toyota', partners: ['toyota', 'emirates'] },
  JPN: { kit: 'canterbury', shirt: 'toyota', partners: ['toyota', 'asahi', 'sony', 'nintendo', 'playstation', 'mizuno'] },
  TGA: { kit: 'mizuno', shirt: 'toyota', partners: ['toyota'] },
  SAM: { kit: 'umbro', shirt: 'cocacola', partners: ['cocacola'] },
  BTH: { kit: 'macron', shirt: 'bupa', partners: ['bupa', 'landrover'] },
  BRS: { kit: 'umbro', shirt: 'heineken', partners: ['heineken', 'bmw'] },
  EXE: { kit: 'puma', shirt: 'monster', partners: ['monster', 'audi'] },
  GLO: { kit: 'kappa', shirt: 'gatorade', partners: ['gatorade', 'volvo'] },
  LEI: { kit: 'underarmour', shirt: 'redbull', partners: ['redbull', 'mclaren'] },
  LDN: { kit: 'castore', shirt: 'allianz', partners: ['allianz', 'mercedes'] },
  LDW: { kit: 'castore', shirt: 'heineken', partners: ['heineken', 'porsche'] },
  NEW: { kit: 'puma', shirt: 'redbull', partners: ['redbull'] },
  NOR: { kit: 'macron', shirt: 'mastercard', partners: ['mastercard', 'ford'] },
  SAL: { kit: 'macron', shirt: 'barclays', partners: ['barclays', 'tesla'] },
  BGS: { kit: 'canterbury', partners: [] },
  CLB: { kit: 'nike', shirt: 'redbull', partners: ['redbull', 'easports'] },
};
