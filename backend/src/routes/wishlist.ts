import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ConditionEnum = z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']);

const EntrySchema = z.object({
  entryKey: z.string().min(1).max(255),
  cardId: z.number().int().positive(),
  cardName: z.string().min(1).max(255),
  cardImageUrl: z.string().url(),
  setName: z.string().min(1).max(255),
  setCode: z.string().min(1).max(100),
  rarity: z.string().min(1).max(100),
  condition: ConditionEnum,
  quantity: z.number().int().min(1),
});

const UpdateSchema = z.object({
  condition: ConditionEnum.optional(),
  quantity: z.number().int().min(1).optional(),
}).refine(d => d.condition !== undefined || d.quantity !== undefined, {
  message: 'At least one field must be provided.',
});

const AcquireSchema = z.object({
  quantity: z.number().int().min(1),
  condition: ConditionEnum,
});

const CustomPriceSchema = z.object({
  entryKey: z.string().min(1).max(255),
  customPriceUsd: z.number().min(0).nullable(),
});

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /wishlist
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM wishlist_entries WHERE user_id = $1 ORDER BY date_added DESC',
      [req.user!.userId]
    );
    res.json({ wishlist: result.rows });
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /wishlist
router.post('/', async (req: Request, res: Response) => {
  const parsed = EntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { entryKey, cardId, cardName, cardImageUrl, setName, setCode, rarity, condition, quantity } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO wishlist_entries
         (user_id, entry_key, card_id, card_name, card_image_url, set_name, set_code, rarity, condition, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, entry_key)
       DO UPDATE SET condition = EXCLUDED.condition, quantity = EXCLUDED.quantity
       RETURNING *`,
      [req.user!.userId, entryKey, cardId, cardName, cardImageUrl, setName, setCode, rarity, condition, quantity]
    );

    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PUT /wishlist/:id
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { condition, quantity } = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (condition !== undefined) { setClauses.push(`condition = $${i++}`); values.push(condition); }
  if (quantity !== undefined) { setClauses.push(`quantity = $${i++}`); values.push(quantity); }

  values.push(req.params.id, req.user!.userId);

  try {
    const result = await pool.query(
      `UPDATE wishlist_entries
       SET ${setClauses.join(', ')}
       WHERE id = $${i++} AND user_id = $${i}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    res.json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Update wishlist error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PATCH /wishlist/price — set custom_price_usd for a wishlist entry
router.patch('/price', async (req: Request, res: Response) => {
  const parsed = CustomPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { entryKey, customPriceUsd } = parsed.data;

  try {
    await pool.query(
      `UPDATE wishlist_entries
       SET custom_price_usd = $1
       WHERE user_id = $2 AND entry_key = $3`,
      [customPriceUsd, req.user!.userId, entryKey],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Set wishlist custom price error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// DELETE /wishlist/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM wishlist_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    res.json({ message: 'Entry removed.' });
  } catch (err) {
    console.error('Delete wishlist error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /wishlist/:id/acquire
// Moves acquired cards into the collection, removes wishlist entry if fully fulfilled
router.post('/:id/acquire', async (req: Request, res: Response) => {
  const parsed = AcquireSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { quantity, condition } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const wishlistResult = await client.query(
      'SELECT * FROM wishlist_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (wishlistResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    const entry = wishlistResult.rows[0];

    // Add to collection (merge quantities if same condition already exists)
    await client.query(
      `INSERT INTO collection_entries
         (user_id, card_id, card_name, card_image_url, set_name, set_code, rarity, condition, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, card_id, set_code, rarity, condition)
       DO UPDATE SET quantity = collection_entries.quantity + EXCLUDED.quantity`,
      [req.user!.userId, entry.card_id, entry.card_name, entry.card_image_url,
       entry.set_name, entry.set_code, entry.rarity, condition, quantity]
    );

    // Sum all owned copies of this card+set+rarity (any condition)
    const ownedResult = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM collection_entries
       WHERE user_id = $1 AND card_id = $2 AND set_code = $3 AND rarity = $4`,
      [req.user!.userId, entry.card_id, entry.set_code, entry.rarity]
    );

    const totalOwned: number = ownedResult.rows[0].total;
    const removed = totalOwned >= entry.quantity;

    if (removed) {
      await client.query('DELETE FROM wishlist_entries WHERE id = $1', [req.params.id]);
    }

    await client.query('COMMIT');

    res.json({ message: 'Cards acquired.', removed });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Acquire error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    client.release();
  }
});

export default router;
