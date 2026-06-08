import type { AppState, Binder } from '../types';
import { DEFAULT_BINDER_COLS, DEFAULT_BINDER_ROWS } from '../types';

const KEY = 'ygobinder_state';

const INITIAL_STATE: AppState = {
  collection: [],
  wishlist: [],
  binders: [],
};

export function loadState(): AppState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      collection: parsed.collection ?? [],
      wishlist: (parsed as any).wishlist ?? (parsed as any).toGet ?? [],
      binders: ((parsed.binders ?? []) as Binder[]).map((b) => ({
        ...b,
        cols: b.cols ?? DEFAULT_BINDER_COLS,
        rows: b.rows ?? DEFAULT_BINDER_ROWS,
      })),
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
