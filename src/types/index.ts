// ── Card data from YGOPRODeck API ─────────────────────────────────────────────

export interface YGOCardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code: string;
  set_price: string;
}

export interface YGOCardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped: string;
}

export interface YGOCardPrice {
  tcgplayer_price: string;
  ebay_price: string;
  amazon_price: string;
  coolstuffinc_price: string;
}

export interface YGOCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  rank?: number;
  linkval?: number;
  attribute?: string;
  race?: string;
  card_sets?: YGOCardSet[];
  card_images: YGOCardImage[];
  card_prices: YGOCardPrice[];
}

export interface YGOSearchResponse {
  data: YGOCard[];
  meta?: {
    current_rows: number;
    total_rows: number;
    rows_remaining: number;
    total_pages: number;
    pages_remaining: number;
    next_page?: string;
    next_page_offset?: number;
  };
}

// ── App state ─────────────────────────────────────────────────────────────────

export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export const CONDITION_ORDER: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

export interface ConditionCopy {
  condition: Condition;
  quantity: number;
}

export interface CollectionEntry {
  id: string; // "<cardId>-<setCode>"
  cardId: number;
  cardName: string;
  cardImageUrl: string;
  setName: string;
  setCode: string;
  rarity: string;
  copies: ConditionCopy[]; // sorted best→worst condition
  notes?: string;
  dateAdded: string; // ISO 8601
}

export interface WishlistEntry {
  id: string; // "<cardId>-<setCode>"
  cardId: number;
  cardName: string;
  cardImageUrl: string;
  setName: string;
  setCode: string;
  rarity: string;
  minCondition: Condition;
  desiredQuantity: number;
  notes?: string;
  dateAdded: string; // ISO 8601
}

export interface AppState {
  collection: CollectionEntry[];
  wishlist: WishlistEntry[];
  binders: Binder[];
}

// ── Binder ────────────────────────────────────────────────────────────────────

export interface BinderSlot {
  entryId: string;
  source: 'collection' | 'wishlist';
  condition?: Condition; // which condition copy occupies this slot (collection only)
}

export interface BinderPage {
  id: string;
  slots: (BinderSlot | null)[]; // length = binder.cols * binder.rows
}

export interface Binder {
  id: string;
  name: string;
  cols: number; // 1–4
  rows: number; // 1–4
  pages: BinderPage[]; // max 20
  coverUrl?: string;
  createdAt: string;
}

export const BINDER_MAX_PAGES = 20;
export const DEFAULT_BINDER_COLS = 3;
export const DEFAULT_BINDER_ROWS = 3;
export const YGO_CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

// ── Price cache ───────────────────────────────────────────────────────────────

export interface PriceCacheEntry {
  cardData: YGOCard;
  expiresAt: number; // Unix ms — midnight of cache date
}

// ── Currency ──────────────────────────────────────────────────────────────────

export type CurrencyCode = 'USD' | 'CAD' | 'EUR' | 'GBP' | 'AUD' | 'JPY';

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'USD', symbol: '$' },
  { code: 'CAD', label: 'CAD', symbol: '$' },
  { code: 'EUR', label: 'EUR', symbol: '€' },
  { code: 'GBP', label: 'GBP', symbol: '£' },
  { code: 'AUD', label: 'AUD', symbol: '$' },
  { code: 'JPY', label: 'JPY', symbol: '¥' },
];

export function formatPrice(
  priceUsd: number,
  currency: CurrencyCode,
  rates: Record<string, number>,
): string {
  const rate = currency === 'USD' ? 1 : (rates[currency] ?? 1);
  const converted = priceUsd * rate;
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === currency)!;

  if (currency === 'JPY') {
    return `${info.symbol}${Math.round(converted).toLocaleString()} ${currency}`;
  }
  return `${info.symbol}${converted.toFixed(2)} ${currency}`;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export type ViewMode = 'grid' | 'list';
