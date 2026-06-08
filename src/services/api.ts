import type { CollectionEntry, ToGetEntry, Condition, ConditionCopy, Binder, BinderPage, BinderSlot } from '../types';
import { CONDITION_ORDER } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ── Auth state ────────────────────────────────────────────────────────────────

let authToken: string | null = null;
let onTokenRefreshed: ((token: string) => void) | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

// AuthContext registers these callbacks so api.ts can notify React of token changes
export function registerAuthCallbacks(
  onRefresh: (token: string) => void,
  onExpired: () => void,
): void {
  onTokenRefreshed = onRefresh;
  onSessionExpired = onExpired;
}

// ── UUID caches ───────────────────────────────────────────────────────────────
// Maps frontend composite keys to backend UUIDs so we can call PUT/DELETE.
// Populated on login and updated on every add.

const collectionCache = new Map<string, string>(); // `${entryKey}:${condition}` → backendUUID
const toGetCache = new Map<string, string>();       // entryKey → backendUUID

export function clearCaches(): void {
  collectionCache.clear();
  toGetCache.clear();
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    credentials: 'include', // sends the httpOnly refresh token cookie
  });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${authToken}`;
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
        credentials: 'include',
      });
    }
    // Refresh failed — session is gone
    onSessionExpired?.();
  }

  return res;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { token: string };
    authToken = body.token;
    onTokenRefreshed?.(body.token);
    return true;
  } catch {
    return false;
  }
}

// ── Data transformation ───────────────────────────────────────────────────────

interface BackendCollectionRow {
  id: string;
  entry_key: string;
  card_id: number;
  card_name: string;
  card_image_url: string;
  set_name: string;
  set_code: string;
  rarity: string;
  condition: Condition;
  quantity: number;
  date_added: string;
}

interface BackendToGetRow {
  id: string;
  entry_key: string;
  card_id: number;
  card_name: string;
  card_image_url: string;
  set_name: string;
  set_code: string;
  rarity: string;
  condition: Condition;
  quantity: number;
  date_added: string;
}

// Groups flat backend rows (one per condition) into frontend entries (copies array)
function groupCollectionRows(rows: BackendCollectionRow[]): CollectionEntry[] {
  const map = new Map<string, CollectionEntry>();

  for (const row of rows) {
    collectionCache.set(`${row.entry_key}:${row.condition}`, row.id);

    if (map.has(row.entry_key)) {
      map.get(row.entry_key)!.copies.push({ condition: row.condition, quantity: row.quantity });
    } else {
      map.set(row.entry_key, {
        id: row.entry_key,
        cardId: row.card_id,
        cardName: row.card_name,
        cardImageUrl: row.card_image_url,
        setName: row.set_name,
        setCode: row.set_code,
        rarity: row.rarity,
        copies: [{ condition: row.condition, quantity: row.quantity }],
        dateAdded: row.date_added,
      });
    }
  }

  for (const entry of map.values()) {
    entry.copies.sort(
      (a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition),
    );
  }

  return Array.from(map.values());
}

function rowToToGet(row: BackendToGetRow): ToGetEntry {
  toGetCache.set(row.entry_key, row.id);
  return {
    id: row.entry_key,
    cardId: row.card_id,
    cardName: row.card_name,
    cardImageUrl: row.card_image_url,
    setName: row.set_name,
    setCode: row.set_code,
    rarity: row.rarity,
    minCondition: row.condition,
    desiredQuantity: row.quantity,
    dateAdded: row.date_added,
  };
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  preferred_currency: string;
}

export const authApi = {
  async register(email: string, password: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error: unknown };
      throw new Error(typeof body.error === 'string' ? body.error : 'Registration failed.');
    }
  },

  async verifyEmail(email: string, code: string): Promise<{ token: string; user: AuthUser }> {
    const res = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error: unknown };
      throw new Error(typeof body.error === 'string' ? body.error : 'Verification failed.');
    }
    return res.json() as Promise<{ token: string; user: AuthUser }>;
  },

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error: unknown; code?: string };
      throw Object.assign(
        new Error(typeof body.error === 'string' ? body.error : 'Login failed.'),
        { code: body.code },
      );
    }
    return res.json() as Promise<{ token: string; user: AuthUser }>;
  },

  async logout(): Promise<void> {
    await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  },

  async updateSettings(preferredCurrency: string): Promise<AuthUser> {
    const res = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferredCurrency }),
    });
    if (!res.ok) throw new Error('Failed to update settings.');
    const body = (await res.json()) as { user: AuthUser };
    return body.user;
  },
};

// ── Collection API ────────────────────────────────────────────────────────────

export const collectionApi = {
  async fetchAll(): Promise<CollectionEntry[]> {
    const res = await apiFetch('/collection');
    if (!res.ok) throw new Error('Failed to load collection.');
    const body = (await res.json()) as { collection: BackendCollectionRow[] };
    return groupCollectionRows(body.collection);
  },

  async addCopy(entry: CollectionEntry, copy: ConditionCopy): Promise<void> {
    const res = await apiFetch('/collection', {
      method: 'POST',
      body: JSON.stringify({
        entryKey: entry.id,
        cardId: entry.cardId,
        cardName: entry.cardName,
        cardImageUrl: entry.cardImageUrl,
        setName: entry.setName,
        setCode: entry.setCode,
        rarity: entry.rarity,
        condition: copy.condition,
        quantity: copy.quantity,
      }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { entry: BackendCollectionRow };
    collectionCache.set(`${entry.id}:${copy.condition}`, body.entry.id);
  },

  async updateCopyQuantity(entryId: string, condition: Condition, quantity: number): Promise<void> {
    const backendId = collectionCache.get(`${entryId}:${condition}`);
    if (!backendId) return;
    await apiFetch(`/collection/${backendId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  },

  async removeCopy(entryId: string, condition: Condition): Promise<void> {
    const backendId = collectionCache.get(`${entryId}:${condition}`);
    if (!backendId) return;
    const res = await apiFetch(`/collection/${backendId}`, { method: 'DELETE' });
    if (res.ok) collectionCache.delete(`${entryId}:${condition}`);
  },

  async removeAllCopies(entryId: string, conditions: Condition[]): Promise<void> {
    await Promise.all(conditions.map((c) => this.removeCopy(entryId, c)));
  },
};

// ── To Get API ────────────────────────────────────────────────────────────────

export const toGetApi = {
  async fetchAll(): Promise<ToGetEntry[]> {
    const res = await apiFetch('/toget');
    if (!res.ok) throw new Error('Failed to load To Get list.');
    const body = (await res.json()) as { toGet: BackendToGetRow[] };
    return body.toGet.map(rowToToGet);
  },

  async add(entry: ToGetEntry): Promise<void> {
    const res = await apiFetch('/toget', {
      method: 'POST',
      body: JSON.stringify({
        entryKey: entry.id,
        cardId: entry.cardId,
        cardName: entry.cardName,
        cardImageUrl: entry.cardImageUrl,
        setName: entry.setName,
        setCode: entry.setCode,
        rarity: entry.rarity,
        condition: entry.minCondition,
        quantity: entry.desiredQuantity,
      }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { entry: BackendToGetRow };
    toGetCache.set(entry.id, body.entry.id);
  },

  async update(entryId: string, patch: { condition?: Condition; quantity?: number }): Promise<void> {
    const backendId = toGetCache.get(entryId);
    if (!backendId) return;
    await apiFetch(`/toget/${backendId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async remove(entryId: string): Promise<void> {
    const backendId = toGetCache.get(entryId);
    if (!backendId) return;
    const res = await apiFetch(`/toget/${backendId}`, { method: 'DELETE' });
    if (res.ok) toGetCache.delete(entryId);
  },

  async acquire(
    entryId: string,
    copies: ConditionCopy[],
  ): Promise<{ removed: boolean }> {
    const backendId = toGetCache.get(entryId);
    if (!backendId) return { removed: false };
    // Backend acquire handles one condition at a time; use the first copy
    const copy = copies[0];
    if (!copy) return { removed: false };
    const res = await apiFetch(`/toget/${backendId}/acquire`, {
      method: 'POST',
      body: JSON.stringify({ quantity: copy.quantity, condition: copy.condition }),
    });
    if (!res.ok) return { removed: false };
    const body = (await res.json()) as { removed: boolean };
    if (body.removed) toGetCache.delete(entryId);
    return body;
  },
};

// ── Prices API ────────────────────────────────────────────────────────────────

export interface PricePoint {
  date: string;
  price_usd: number;
  rates: Record<string, number>;
}

export const pricesApi = {
  async getHistory(
    cardId: number,
    setCode: string,
    rarity: string,
    days = 90,
  ): Promise<PricePoint[]> {
    const params = new URLSearchParams({
      cardId: String(cardId),
      setCode,
      rarity,
      days: String(days),
    });
    const res = await apiFetch(`/prices?${params}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { history: PricePoint[] };
    return body.history;
  },

  async getLatestRates(): Promise<Record<string, number>> {
    const res = await fetch(`${BASE_URL}/prices/rates`);
    if (!res.ok) return {};
    const body = (await res.json()) as { rates: Record<string, number> };
    return body.rates;
  },
};

// ── Binder API ────────────────────────────────────────────────────────────────

interface BackendBinder {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cover_url: string | null;
  created_at: string;
  pages: BackendBinderPage[];
}

interface BackendBinderPage {
  id: string;
  page_number: number;
  slots: BackendBinderSlot[];
}

interface BackendBinderSlot {
  position: number;
  entry_key: string | null;
  source: 'collection' | 'toGet' | null;
  condition: Condition | null;
}

function backendPageToFrontend(page: BackendBinderPage, slotCount: number): BinderPage {
  const slots: (BinderSlot | null)[] = Array(slotCount).fill(null);
  for (const slot of page.slots) {
    if (slot.entry_key && slot.source) {
      slots[slot.position] = {
        entryId: slot.entry_key,
        source: slot.source,
        condition: slot.condition ?? undefined,
      };
    }
  }
  return { id: page.id, slots };
}

function backendBinderToFrontend(b: BackendBinder): Binder {
  const slotCount = b.cols * b.rows;
  return {
    id: b.id,
    name: b.name,
    cols: b.cols,
    rows: b.rows,
    coverUrl: b.cover_url ?? undefined,
    createdAt: b.created_at,
    pages: b.pages.map((p) => backendPageToFrontend(p, slotCount)),
  };
}

export const binderApi = {
  async fetchAll(): Promise<Binder[]> {
    const res = await apiFetch('/binders');
    if (!res.ok) throw new Error('Failed to load binders.');
    const body = (await res.json()) as { binders: BackendBinder[] };
    return body.binders.map(backendBinderToFrontend);
  },

  async create(name: string, cols: number, rows: number, coverUrl?: string): Promise<Binder> {
    const res = await apiFetch('/binders', {
      method: 'POST',
      body: JSON.stringify({ name, cols, rows, pageCount: 1, coverUrl: coverUrl ?? null }),
    });
    if (!res.ok) throw new Error('Failed to create binder.');
    const body = (await res.json()) as { binder: BackendBinder };
    return backendBinderToFrontend(body.binder);
  },

  async rename(binderId: string, name: string): Promise<void> {
    await apiFetch(`/binders/${binderId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  async setCover(binderId: string, coverUrl: string | null): Promise<void> {
    await apiFetch(`/binders/${binderId}`, {
      method: 'PUT',
      body: JSON.stringify({ coverUrl }),
    });
  },

  async delete(binderId: string): Promise<void> {
    await apiFetch(`/binders/${binderId}`, { method: 'DELETE' });
  },

  async addPage(binderId: string, slotCount: number): Promise<BinderPage> {
    const res = await apiFetch(`/binders/${binderId}/pages`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to add page.');
    const body = (await res.json()) as { page: BackendBinderPage };
    return backendPageToFrontend(body.page, slotCount);
  },

  async removePage(binderId: string, pageId: string): Promise<void> {
    await apiFetch(`/binders/${binderId}/pages/${pageId}`, { method: 'DELETE' });
  },

  async setSlot(
    binderId: string,
    pageId: string,
    position: number,
    slot: BinderSlot | null,
  ): Promise<void> {
    await apiFetch(`/binders/${binderId}/pages/${pageId}/slots/${position}`, {
      method: 'PUT',
      body: JSON.stringify(
        slot
          ? { entryKey: slot.entryId, source: slot.source, condition: slot.condition ?? null }
          : { entryKey: null, source: null, condition: null },
      ),
    });
  },
};

// ── Sync API ──────────────────────────────────────────────────────────────────

export const syncApi = {
  async importLocalData(
    collection: CollectionEntry[],
    toGet: ToGetEntry[],
    binders: Binder[],
  ): Promise<void> {
    // Transform frontend entries back to the flat shape the sync endpoint expects
    const flatCollection = collection.flatMap((entry) =>
      entry.copies.map((copy) => ({
        entryKey: entry.id,
        cardId: entry.cardId,
        cardName: entry.cardName,
        cardImageUrl: entry.cardImageUrl,
        setName: entry.setName,
        setCode: entry.setCode,
        rarity: entry.rarity,
        condition: copy.condition,
        quantity: copy.quantity,
        dateAdded: entry.dateAdded,
      })),
    );

    const flatToGet = toGet.map((entry) => ({
      entryKey: entry.id,
      cardId: entry.cardId,
      cardName: entry.cardName,
      cardImageUrl: entry.cardImageUrl,
      setName: entry.setName,
      setCode: entry.setCode,
      rarity: entry.rarity,
      condition: entry.minCondition,
      quantity: entry.desiredQuantity,
      dateAdded: entry.dateAdded,
    }));

    const serializedBinders = binders.map((b) => ({
      id: b.id,
      name: b.name,
      cols: b.cols,
      rows: b.rows,
      pages: b.pages.map((p) => ({
        slots: p.slots.map((s) =>
          s
            ? { entryId: s.entryId, source: s.source, condition: s.condition ?? null }
            : { entryId: null, source: null, condition: null },
        ),
      })),
    }));

    await apiFetch('/sync', {
      method: 'POST',
      body: JSON.stringify({ collection: flatCollection, toGet: flatToGet, binders: serializedBinders }),
    });
  },
};
