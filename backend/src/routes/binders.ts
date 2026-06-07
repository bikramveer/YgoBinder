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
});

const RenameBinderSchema = z.object({
  name: z.string().min(1).max(255),
});

const SlotSchema = z.object({
  entryId: z.string().uuid().nullable(),
  condition: ConditionEnum.nullable(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// Fetches all binders + pages + slots for a user and assembles the nested structure
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

  // Group slots by page_id
  const slotsByPage = new Map<string, BinderSlot[]>();
  for (const slot of slotsResult.rows) {
    if (!slotsByPage.has(slot.page_id)) slotsByPage.set(slot.page_id, []);
    slotsByPage.get(slot.page_id)!.push({
      position: slot.position,
      entry_id: slot.entry_id,
      condition: slot.condition,
    });
  }

  // Group pages by binder_id
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

// POST /binders — create a new binder with the requested number of pages
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateBinderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, cols, rows, pageCount } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const binderResult = await client.query(
      'INSERT INTO binders (user_id, name, cols, rows) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user!.userId, name, cols, rows]
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

// PUT /binders/:id — rename a binder
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = RenameBinderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE binders SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [parsed.data.name, req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    res.json({ binder: result.rows[0] });
  } catch (err) {
    console.error('Rename binder error:', err);
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

// POST /binders/:id/pages — add a page to a binder
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

// DELETE /binders/:id/pages/:pageNumber — remove the last page
router.delete('/:id/pages/:pageNumber', async (req: Request, res: Response) => {
  const pageNumber = parseInt(req.params.pageNumber, 10);

  try {
    // Verify binder belongs to user
    const binderResult = await pool.query(
      'SELECT id FROM binders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId]
    );
    if (binderResult.rows.length === 0) {
      res.status(404).json({ error: 'Binder not found.' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM binder_pages WHERE binder_id = $1 AND page_number = $2 RETURNING id',
      [req.params.id, pageNumber]
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

// PUT /binders/:id/pages/:pageNumber/slots/:position — set or clear a slot
router.put('/:id/pages/:pageNumber/slots/:position', async (req: Request, res: Response) => {
  const parsed = SlotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { entryId, condition } = parsed.data;
  const position = parseInt(req.params.position, 10);
  const pageNumber = parseInt(req.params.pageNumber, 10);

  try {
    // Get the page, verify binder ownership
    const pageResult = await pool.query(
      `SELECT bp.id FROM binder_pages bp
       JOIN binders b ON b.id = bp.binder_id
       WHERE b.id = $1 AND b.user_id = $2 AND bp.page_number = $3`,
      [req.params.id, req.user!.userId, pageNumber]
    );

    if (pageResult.rows.length === 0) {
      res.status(404).json({ error: 'Page not found.' });
      return;
    }

    const pageId: string = pageResult.rows[0].id;

    if (entryId === null) {
      // Clear the slot
      await pool.query(
        'DELETE FROM binder_slots WHERE page_id = $1 AND position = $2',
        [pageId, position]
      );
      res.json({ message: 'Slot cleared.' });
    } else {
      // Verify the collection entry belongs to this user
      const entryResult = await pool.query(
        'SELECT id FROM collection_entries WHERE id = $1 AND user_id = $2',
        [entryId, req.user!.userId]
      );
      if (entryResult.rows.length === 0) {
        res.status(404).json({ error: 'Collection entry not found.' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO binder_slots (page_id, position, entry_id, condition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (page_id, position)
         DO UPDATE SET entry_id = EXCLUDED.entry_id, condition = EXCLUDED.condition
         RETURNING *`,
        [pageId, position, entryId, condition]
      );

      res.json({ slot: result.rows[0] });
    }
  } catch (err) {
    console.error('Update slot error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
