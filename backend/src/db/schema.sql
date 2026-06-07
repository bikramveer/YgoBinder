-- Run this file once against your PostgreSQL database to create the schema.
-- On Railway: open the database shell and paste this in, or use a migration tool later.

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6-digit OTP codes for email verification
CREATE TABLE IF NOT EXISTS email_otps (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        CHAR(6) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens (stored as SHA-256 hashes — plain token lives only in the cookie)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Collection entries — one row per user + card + set + rarity + condition
CREATE TABLE IF NOT EXISTS collection_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_key     VARCHAR(255) NOT NULL, -- frontend composite key: "${cardId}-${setCode}-${rarityCode}"
  card_id       INTEGER NOT NULL,
  card_name     VARCHAR(255) NOT NULL,
  card_image_url TEXT NOT NULL,
  set_name      VARCHAR(255) NOT NULL,
  set_code      VARCHAR(100) NOT NULL,
  rarity        VARCHAR(100) NOT NULL,
  condition     VARCHAR(10) NOT NULL CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DMG')),
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  date_added    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entry_key, condition)
);

-- To Get entries — one row per user + card + set + rarity (condition = minimum acceptable)
CREATE TABLE IF NOT EXISTS toget_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_key     VARCHAR(255) NOT NULL, -- frontend composite key: "${cardId}-${setCode}-${rarityCode}"
  card_id       INTEGER NOT NULL,
  card_name     VARCHAR(255) NOT NULL,
  card_image_url TEXT NOT NULL,
  set_name      VARCHAR(255) NOT NULL,
  set_code      VARCHAR(100) NOT NULL,
  rarity        VARCHAR(100) NOT NULL,
  condition     VARCHAR(10) NOT NULL CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DMG')),
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  date_added    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entry_key)
);

-- Binders
CREATE TABLE IF NOT EXISTS binders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  cols        INTEGER NOT NULL DEFAULT 3 CHECK (cols BETWEEN 1 AND 4),
  rows        INTEGER NOT NULL DEFAULT 3 CHECK (rows BETWEEN 1 AND 4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Binder pages (ordered by page_number within a binder)
CREATE TABLE IF NOT EXISTS binder_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binder_id   UUID NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  UNIQUE (binder_id, page_number)
);

-- Binder slots — each slot on a page holds a planned card (collection or to-get)
CREATE TABLE IF NOT EXISTS binder_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES binder_pages(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  entry_key   VARCHAR(255),
  source      VARCHAR(20) CHECK (source IN ('collection', 'toGet')),
  condition   VARCHAR(10) CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DMG')),
  UNIQUE (page_id, position)
);

-- Price history — one USD price snapshot per (card, set, rarity) per day
CREATE TABLE IF NOT EXISTS price_history (
  id           SERIAL PRIMARY KEY,
  card_id      INTEGER NOT NULL,
  set_code     VARCHAR(100) NOT NULL,
  rarity       VARCHAR(100) NOT NULL,
  price_usd    NUMERIC(10, 2),
  recorded_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (card_id, set_code, rarity, recorded_at)
);

-- Daily exchange rates from USD (sourced from Frankfurter / ECB)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id           SERIAL PRIMARY KEY,
  currency     VARCHAR(10) NOT NULL,
  rate         NUMERIC(12, 6) NOT NULL,
  recorded_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (currency, recorded_at)
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_collection_user ON collection_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_toget_user ON toget_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_binders_user ON binders(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_otps_user ON email_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON price_history(card_id, set_code, rarity);

-- User preferred currency (add to existing users table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(10) NOT NULL DEFAULT 'USD';

-- Binder slots schema migration (entry_key + source replaces entry_id UUID FK)
ALTER TABLE binder_slots DROP COLUMN IF EXISTS entry_id;
ALTER TABLE binder_slots ADD COLUMN IF NOT EXISTS entry_key VARCHAR(255);
ALTER TABLE binder_slots ADD COLUMN IF NOT EXISTS source VARCHAR(20) CHECK (source IN ('collection', 'toGet'));

-- Binder cover image URL
ALTER TABLE binders ADD COLUMN IF NOT EXISTS cover_url VARCHAR(500);
