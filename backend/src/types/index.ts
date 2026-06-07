export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export type CurrencyCode = 'USD' | 'CAD' | 'EUR' | 'GBP' | 'AUD' | 'JPY';

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'];

export interface User {
  id: number;
  email: string;
  email_verified: boolean;
  preferred_currency: CurrencyCode;
  created_at: string;
}

export interface CollectionEntry {
  id: string;
  user_id: number;
  card_id: number;
  card_name: string;
  card_image_url: string;
  set_name: string;
  set_code: string;
  rarity: string;
  condition: Condition;
  quantity: number;
  date_added: string;
}

export interface ToGetEntry {
  id: string;
  user_id: number;
  card_id: number;
  card_name: string;
  card_image_url: string;
  set_name: string;
  set_code: string;
  rarity: string;
  condition: Condition;
  quantity: number;
  date_added: string;
}

export interface BinderSlot {
  position: number;
  entry_id: string | null;
  condition: Condition | null;
}

export interface BinderPage {
  id: string;
  page_number: number;
  slots: BinderSlot[];
}

export interface Binder {
  id: string;
  name: string;
  cols: number;
  rows: number;
  created_at: string;
  pages: BinderPage[];
}

// Shape of a JWT payload
export interface TokenPayload {
  userId: number;
  email: string;
}
