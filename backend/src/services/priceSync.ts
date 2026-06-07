import pool from '../db';

const YGOPRODECK_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=CAD,EUR,GBP,AUD,JPY';

// Delay between YGOPRODeck API calls to avoid hammering a free API
const DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface YGOCardSet {
  set_code: string;
  set_rarity: string;
  set_price: string;
}

interface YGOCardResponse {
  data?: Array<{ card_sets?: YGOCardSet[] }>;
}

interface FrankfurterResponse {
  rates: Record<string, number>;
}

// ── Exchange rates ────────────────────────────────────────────────────────────

async function syncExchangeRates(client: { query: typeof pool.query }): Promise<void> {
  const res = await fetch(FRANKFURTER_URL);
  if (!res.ok) {
    console.error('Frankfurter API error:', res.status);
    return;
  }

  const body = (await res.json()) as FrankfurterResponse;

  for (const [currency, rate] of Object.entries(body.rates)) {
    await client.query(
      `INSERT INTO exchange_rates (currency, rate, recorded_at)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT (currency, recorded_at) DO NOTHING`,
      [currency, rate],
    );
  }

  console.log('Exchange rates synced:', Object.keys(body.rates).join(', '));
}

// ── Price sync ────────────────────────────────────────────────────────────────

export async function runPriceSync(): Promise<void> {
  console.log('Price sync started:', new Date().toISOString());

  const client = await pool.connect();
  try {
    // Get all unique (card_id, set_code, rarity) tracked across all users
    const tracked = await client.query<{ card_id: number; set_code: string; rarity: string }>(
      `SELECT DISTINCT card_id, set_code, rarity FROM collection_entries
       UNION
       SELECT DISTINCT card_id, set_code, rarity FROM toget_entries`,
    );

    if (tracked.rows.length === 0) {
      console.log('Price sync: no tracked cards, skipping.');
      await syncExchangeRates(client);
      return;
    }

    // Group by card_id — one API call per card fetches all its set prices
    const byCardId = new Map<number, Array<{ setCode: string; rarity: string }>>();
    for (const row of tracked.rows) {
      if (!byCardId.has(row.card_id)) byCardId.set(row.card_id, []);
      byCardId.get(row.card_id)!.push({ setCode: row.set_code, rarity: row.rarity });
    }

    let synced = 0;
    let failed = 0;

    for (const [cardId, sets] of byCardId) {
      try {
        const res = await fetch(`${YGOPRODECK_URL}?id=${cardId}`);
        if (!res.ok) {
          failed++;
          await sleep(DELAY_MS);
          continue;
        }

        const body = (await res.json()) as YGOCardResponse;
        const cardSets = body.data?.[0]?.card_sets ?? [];

        // Build a lookup: setCode+rarity → price
        const priceMap = new Map<string, number>();
        for (const s of cardSets) {
          const price = parseFloat(s.set_price);
          if (!isNaN(price) && price > 0) {
            priceMap.set(`${s.set_code}|${s.set_rarity}`, price);
          }
        }

        // Insert a price snapshot for each tracked (set_code, rarity) we found
        for (const { setCode, rarity } of sets) {
          const price = priceMap.get(`${setCode}|${rarity}`);
          if (price === undefined) continue;

          await client.query(
            `INSERT INTO price_history (card_id, set_code, rarity, price_usd, recorded_at)
             VALUES ($1, $2, $3, $4, CURRENT_DATE)
             ON CONFLICT (card_id, set_code, rarity, recorded_at) DO NOTHING`,
            [cardId, setCode, rarity, price],
          );
          synced++;
        }
      } catch (err) {
        console.error(`Price sync failed for card ${cardId}:`, err);
        failed++;
      }

      await sleep(DELAY_MS);
    }

    // Sync exchange rates in the same job run
    await syncExchangeRates(client);

    console.log(`Price sync complete: ${synced} prices saved, ${failed} cards failed.`);
  } catch (err) {
    console.error('Price sync error:', err);
  } finally {
    client.release();
  }
}
