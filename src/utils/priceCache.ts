import type { PriceCacheEntry, YGOCard } from '../types';

const KEY_PREFIX = 'price_cache_';

function midnightMs(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function getCachedCard(cardId: number): YGOCard | null {
  const raw = localStorage.getItem(`${KEY_PREFIX}${cardId}`);
  if (!raw) return null;
  try {
    const entry: PriceCacheEntry = JSON.parse(raw);
    if (Date.now() >= entry.expiresAt) {
      localStorage.removeItem(`${KEY_PREFIX}${cardId}`);
      return null;
    }
    return entry.cardData;
  } catch {
    return null;
  }
}

export function setCachedCard(cardId: number, cardData: YGOCard): void {
  const entry: PriceCacheEntry = {
    cardData,
    expiresAt: midnightMs(),
  };
  localStorage.setItem(`${KEY_PREFIX}${cardId}`, JSON.stringify(entry));
}
