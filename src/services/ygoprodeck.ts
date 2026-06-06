import type { YGOCard, YGOSearchResponse } from '../types';

const BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const PAGE_SIZE = 20;

export async function searchCards(
  query: string,
  offset: number = 0,
  cardType?: string,
): Promise<YGOSearchResponse> {
  const params = new URLSearchParams({
    fname: query,
    num: String(PAGE_SIZE),
    offset: String(offset),
    // include set data so we can do client-side rarity filtering
    misc: 'yes',
  });

  if (cardType) {
    params.set('type', cardType);
  }

  const res = await fetch(`${BASE}?${params}`);
  if (res.status === 400) {
    // YGOPRODeck returns 400 when no cards match — treat as empty
    return { data: [] };
  }
  if (!res.ok) throw new Error(`YGOPRODeck search failed: ${res.status}`);
  return res.json() as Promise<YGOSearchResponse>;
}

export async function getCardById(id: number): Promise<YGOCard> {
  const params = new URLSearchParams({ id: String(id) });
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`YGOPRODeck card fetch failed: ${res.status}`);
  const body = (await res.json()) as YGOSearchResponse;
  if (!body.data[0]) throw new Error(`Card ${id} not found`);
  return body.data[0];
}
