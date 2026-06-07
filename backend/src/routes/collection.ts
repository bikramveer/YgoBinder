import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ConditionEnum = z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']);

const EntrySchema = z.object({
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
  message: 'At least one field (condition or quantity) must be provided.',
});

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /collection
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM collection_entries WHERE user_id = $1 ORDER BY date_added DESC',
      [req.user!.userId]
    );
    res.json({ collection: result.rows });
  } catch (err) {
    console.error('Get collection error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /collection
router.post('/', async (req: Request, res: Response) => {
  const parsed = EntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { cardId, cardName, cardImageUrl, setName, setCode, rarity, condition, quantity } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO collection_entries
         (user_id, card_id, card_name, card_image_url, set_name, set_code, rarity, condition, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, card_id, set_code, rarity, condition)
       DO UPDATE SET quantity = collection_entries.quantity + EXCLUDED.quantity
       RETURNING *`,
      [req.user!.userId, cardId, cardName, cardImageUrl, setName, setCode, rarity, condition, quantity]
    );

    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Add to collection error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PUT /collection/:id
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
      `UPDATE collection_entries
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
    console.error('Update collection error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// DELETE /collection/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM collection_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found.' });
      return;
    }

    res.json({ message: 'Entry removed.' });
  } catch (err) {
    console.error('Delete collection error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
