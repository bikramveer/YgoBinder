import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';
import { runPriceSync } from '../services/priceSync';

const router = Router();

// ── GET /prices/rates — public, returns the most recent exchange rates ─────────
// Used by guests (who can't call /prices) to convert current prices.

router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT currency, rate
       FROM exchange_rates
       WHERE recorded_at = (SELECT MAX(recorded_at) FROM exchange_rates)`,
    );

    const rates: Record<string, number> = { USD: 1 };
    for (const row of result.rows) {
      rates[row.currency] = parseFloat(row.rate);
    }

    res.json({ rates });
  } catch (err) {
    console.error('Exchange rates error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ── GET /prices — authenticated, returns price history for one card+set+rarity ─

const PriceQuerySchema = z.object({
  cardId: z.coerce.number().int().positive(),
  setCode: z.string().min(1).max(100),
  rarity: z.string().min(1).max(100),
  days: z.coerce.number().int().min(1).max(365).default(90),
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = PriceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { cardId, setCode, rarity, days } = parsed.data;

  try {
    // Join price history with exchange rates for the matching date so each
    // data point carries historically accurate rates (not today's rate applied backward)
    const result = await pool.query(
      `SELECT
         ph.recorded_at::text AS date,
         ph.price_usd::float  AS price_usd,
         COALESCE(
           json_object_agg(er.currency, er.rate::float)
             FILTER (WHERE er.currency IS NOT NULL),
           '{}'::json
         ) AS rates
       FROM price_history ph
       LEFT JOIN exchange_rates er ON er.recorded_at = ph.recorded_at
       WHERE ph.card_id   = $1
         AND ph.set_code  = $2
         AND ph.rarity    = $3
         AND ph.recorded_at >= CURRENT_DATE - ($4 * INTERVAL '1 day')
       GROUP BY ph.recorded_at, ph.price_usd
       ORDER BY ph.recorded_at`,
      [cardId, setCode, rarity, days],
    );

    res.json({ history: result.rows });
  } catch (err) {
    console.error('Price history error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /prices/sync — manual trigger for testing, remove before public launch
router.post('/sync', requireAuth, async (_req: Request, res: Response) => {
  res.json({ message: 'Price sync started. Check server logs for progress.' });
  runPriceSync().catch((err) => console.error('Manual sync error:', err));
});

export default router;
