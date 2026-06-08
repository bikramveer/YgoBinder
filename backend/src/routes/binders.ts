import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';
import { Binder, BinderPage, BinderSlot } from '../types';

const router = Router();
router.use(requireAuth);

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ConditionEnum = z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']);

const CreateBinderSchema = z.object({
  name: z.string().min(1).max(255),
  cols: z.number().int().min(1).max(4),
  rows: z.number().int().min(1).max(4),
  pageCount: z.number().int().min(1).max(20).default(1),
  coverUrl: z.string().url().max(500).optional().nullable(),
});

const UpdateBinderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  coverUrl: z.string().url().max(500).optional().nullable(),
});

const SlotSchema = z.object({
  entryKey: z.string().max(255).nullable(),
  source: z.enum(['collection', 'wishlist']).nullable(),
  condition: ConditionEnum.nullable(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchBinders(userId: number): Promise<Binder[]> {
  const bindersResult = await pool.query(
    'SELECT * FROM binders WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );

  if (bindersResult.rows.length === 0) return [];

  const binderIds: string[] = bindersResult.rows.map(b => b.id);

  const pagesResult = await pool.query(
    'SELECT * FROM binder_pages WHERE binder_id = ANY($1) ORDER BY binder_id, page_number ASC',
    [binderIds]
  );

  const pageIds: string[] = pagesResult.rows.map(p => p.id);

  const slotsResult = pageIds.length > 0
    ? await pool.query(
        'SELECT * FROM binder_slots WHERE page_id = ANY($1) ORDER BY page_id, position ASC',
        [pageIds]
      )
    : { rows: [] };

  const slotsByPage = new Map<string, BinderSlot[]>();
  for (const slot of slotsResult.rows) {
    if (!slotsByPage.has(slot.page_id)) slotsByPage.set(slot.page_id, []);
    slotsByPage.get(slot.page_id)!.push({
      position: slot.position,
      entry_key: slot.entry_key,
      source: slot.source,
      condition: slot.condition,
    });
  }

  const pagesByBinder = new Map<string, BinderPage[]>();
  for (const page of pagesResult.rows) {
    if (!pagesByBinder.has(page.binder_id)) pagesByBinder.set(page.binder_id, []);
    pagesByBinder.get(page.binder_id)!.push({
      id: page.id,
      page_number: page.page_number,
      slots: slotsByPage.get(page.id) ?? [],
    });
  }

  return bindersResult.rows.map(b => ({
    id: b.id,
    name: b.name,
    cols: b.cols,
    rows: b.rows,
    cover_url: b.cover_url ?? null,
    created_at: b.created_at,
    pages: pagesByBinder.get(b.id) ?? [],
  }));
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /binders
router.get('/', async (req: Request, res: Response) => {
  try {
    const binders = await fetchBinders(req.user!.userId);
    res.json({ binders });
  } catch (err) {
    console.error('Get binders error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /binders
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateBinderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, cols, rows, pageCount, coverUrl } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const binderResult = await client.query(
      'INSERT INTO binders (user_id, name, cols, rows, cover_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user!.userId, name, cols, rows, coverUrl ?? null]
    );

    const binder = binderResult.rows[0];

    for (let p = 1; p <= pageCount; p++) {
      await client.query(
        'INSERT INTO binder_pages (binder_id, page_number) VALUES ($1, $2)',
        [binder.id, p]
      );
    }

    await client.query('COMMIT');

    const binders = await fetchBinders(req.user!.userId);
    const created = binders.find(b => b.id === binder.id)!;

    res.status(201).json({ binder: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create binder error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    client.release();
  }
});

// PUT /binders/:id — update name and/or cover
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateBinderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, coverUrl } = parsed.data;
  if (name === undefined && coverUrl === undefined) {
    res.status(400).json({ error: 'Provide name or coverUrl to update.' });
    return;
  }

  try {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(name); }
    if (coverUrl !== undefined) { sets.push(`cover_url = $${sets.length + 1}`); values.push(coverUrl); }
    values.push(req.params.id, req.user!.userId);

    const result = await pool.query(
      `UPDATE binders SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    res.json({ binder: result.rows[0] });
  } catch (err) {
    console.error('Update binder error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// DELETE /binders/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM binders WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    res.json({ message: 'Binder deleted.' });
  } catch (err) {
    console.error('Delete binder error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /binders/:id/pages
router.post('/:id/pages', async (req: Request, res: Response) => {
  try {
    const binderResult = await pool.query(
      'SELECT id FROM binders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );

    if (binderResult.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM binder_pages WHERE binder_id = $1',
      [req.params.id]
    );

    const currentCount: number = countResult.rows[0].count;
    if (currentCount >= 20) {
      res.status(400).json({ error: 'Binders can have at most 20 pages.' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO binder_pages (binder_id, page_number) VALUES ($1, $2) RETURNING *',
      [req.params.id, currentCount + 1]
    );

    res.status(201).json({ page: { ...result.rows[0], slots: [] } });
  } catch (err) {
    console.error('Add page error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// DELETE /binders/:id/pages/:pageId — remove a page by UUID
router.delete('/:id/pages/:pageId', async (req: Request, res: Response) => {
  try {
    const binderResult = await pool.query(
      'SELECT id FROM binders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );
    if (binderResult.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM binder_pages WHERE id = $1 AND binder_id = $2 RETURNING id',
      [req.params.pageId, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Page not found.' });
      return;
    }

    res.json({ message: 'Page removed.' });
  } catch (err) {
    console.error('Delete page error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PUT /binders/:id/pages/:pageId/slots/:position — set or clear a slot
router.put('/:id/pages/:pageId/slots/:position', async (req: Request, res: Response) => {
  const parsed = SlotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { entryKey, source, condition } = parsed.data;
  const position = parseInt(req.params.position, 10);

  try {
    const pageResult = await pool.query(
      `SELECT bp.id FROM binder_pages bp
       JOIN binders b ON b.id = bp.binder_id
       WHERE bp.id = $1 AND b.id = $2 AND b.user_id = $3`,
      [req.params.pageId, req.params.id, req.user!.userId]
    );

    if (pageResult.rows.length === 0) {
      res.status(404).json({ error: 'Page not found.' });
      return;
    }

    if (entryKey === null) {
      await pool.query(
        'DELETE FROM binder_slots WHERE page_id = $1 AND position = $2',
        [req.params.pageId, position]
      );
      res.json({ message: 'Slot cleared.' });
    } else {
      const result = await pool.query(
        `INSERT INTO binder_slots (page_id, position, entry_key, source, condition)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (page_id, position)
         DO UPDATE SET entry_key = EXCLUDED.entry_key, source = EXCLUDED.source, condition = EXCLUDED.condition
         RETURNING *`,
        [req.params.pageId, position, entryKey, source, condition]
      );
      res.json({ slot: result.rows[0] });
    }
  } catch (err) {
    console.error('Update slot error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
