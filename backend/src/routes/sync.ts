import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ConditionEnum = z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']);

const LocalEntrySchema = z.object({
  entryKey: z.string().min(1).max(255),
  cardId: z.number().int().positive(),
  cardName: z.string().min(1).max(255),
  cardImageUrl: z.string().url(),
  setName: z.string().min(1).max(255),
  setCode: z.string().min(1).max(100),
  rarity: z.string().min(1).max(100),
  condition: ConditionEnum,
  quantity: z.number().int().min(1),
  dateAdded: z.string().optional(),
});

const LocalSlotSchema = z.object({
  // Frontend entry ID: "${cardId}-${setCode}-${rarityCode}"
  entryId: z.string().optional().nullable(),
  condition: ConditionEnum.optional().nullable(),
});

const LocalPageSchema = z.object({
  slots: z.array(LocalSlotSchema),
});

const LocalBinderSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  cols: z.number().int().min(1).max(4),
  rows: z.number().int().min(1).max(4),
  pages: z.array(LocalPageSchema),
});

const SyncSchema = z.object({
  collection: z.array(LocalEntrySchema),
  toGet: z.array(LocalEntrySchema),
  binders: z.array(LocalBinderSchema),
});

// ── Route ─────────────────────────────────────────────────────────────────────

// POST /sync
// One-time import of a guest user's localStorage data on first login.
// Uses ON CONFLICT DO NOTHING so existing server data is never overwritten.
router.post('/', async (req: Request, res: Response) => {
  const parsed = SyncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { collection, toGet, binders } = parsed.data;
  const userId = req.user!.userId;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Tracks frontend entryId → server UUID for binder slot resolution
    const entryKeyToServerUUID = new Map<string, string>();

    // Import collection entries
    for (const entry of collection) {
      const result = await client.query(
        `INSERT INTO collection_entries
           (user_id, entry_key, card_id, card_name, card_image_url, set_name, set_code, rarity, condition, quantity, date_added)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id, entry_key, condition) DO NOTHING
         RETURNING id, entry_key, condition`,
        [userId, entry.entryKey, entry.cardId, entry.cardName, entry.cardImageUrl,
         entry.setName, entry.setCode, entry.rarity, entry.condition,
         entry.quantity, entry.dateAdded ?? new Date().toISOString()]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        entryKeyToServerUUID.set(`${row.entry_key}:${row.condition}`, row.id);
      }
    }

    // Also load any pre-existing entries so binder slots can resolve them
    const existingResult = await client.query(
      'SELECT id, entry_key, condition FROM collection_entries WHERE user_id = $1',
      [userId]
    );
    for (const row of existingResult.rows) {
      const key = `${row.entry_key}:${row.condition}`;
      if (!entryKeyToServerUUID.has(key)) {
        entryKeyToServerUUID.set(key, row.id);
      }
    }

    // Import To Get entries
    for (const entry of toGet) {
      await client.query(
        `INSERT INTO toget_entries
           (user_id, entry_key, card_id, card_name, card_image_url, set_name, set_code, rarity, condition, quantity, date_added)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id, entry_key) DO NOTHING`,
        [userId, entry.entryKey, entry.cardId, entry.cardName, entry.cardImageUrl,
         entry.setName, entry.setCode, entry.rarity, entry.condition,
         entry.quantity, entry.dateAdded ?? new Date().toISOString()]
      );
    }

    // Import binders
    for (const binder of binders) {
      const binderResult = await client.query(
        'INSERT INTO binders (user_id, name, cols, rows) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, binder.name, binder.cols, binder.rows]
      );
      const binderId: string = binderResult.rows[0].id;

      for (let p = 0; p < binder.pages.length && p < 20; p++) {
        const pageResult = await client.query(
          'INSERT INTO binder_pages (binder_id, page_number) VALUES ($1, $2) RETURNING id',
          [binderId, p + 1]
        );
        const pageId: string = pageResult.rows[0].id;

        for (let s = 0; s < binder.pages[p].slots.length; s++) {
          const slot = binder.pages[p].slots[s];
          if (!slot.entryId || !slot.condition) continue;

          // The frontend entryId is "${cardId}-${setCode}-${rarityCode}"
          // We stored with key "${cardId}-${setCode}-${rarity}:${condition}"
          const key = `${slot.entryId}:${slot.condition}`;
          const serverEntryId = entryKeyToServerUUID.get(key);
          if (!serverEntryId) continue;

          await client.query(
            `INSERT INTO binder_slots (page_id, position, entry_id, condition)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (page_id, position) DO NOTHING`,
            [pageId, s, serverEntryId, slot.condition]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Data imported successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Something went wrong during import.' });
  } finally {
    client.release();
  }
});

export default router;
