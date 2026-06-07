import React, { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react';
import type { AppState, CollectionEntry, ToGetEntry, ConditionCopy, Condition, Binder, BinderPage, BinderSlot } from '../types';
import { CONDITION_ORDER } from '../types';
import { loadState, saveState } from '../utils/storage';
import { useAuth } from './AuthContext';
import { collectionApi, toGetApi, syncApi, binderApi } from '../services/api';

// ── Actions ───────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD_STATE'; state: AppState }
  | { type: 'ADD_TO_COLLECTION'; entry: CollectionEntry }
  | { type: 'UPDATE_COLLECTION_COPIES'; id: string; copies: ConditionCopy[] }
  | { type: 'UPDATE_COLLECTION_NOTES'; id: string; notes: string }
  | { type: 'REMOVE_FROM_COLLECTION'; id: string }
  | { type: 'REMOVE_COLLECTION_COPIES'; id: string; amount: number; condition?: Condition }
  | { type: 'ADD_TO_TO_GET'; entry: ToGetEntry }
  | { type: 'UPDATE_TO_GET'; id: string; patch: Partial<ToGetEntry> }
  | { type: 'REMOVE_FROM_TO_GET'; id: string }
  | { type: 'REDUCE_TO_GET_QUANTITY'; id: string; amount: number }
  | { type: 'ACQUIRE'; toGetId: string; acquiredCopies: ConditionCopy[] }
  | { type: 'CREATE_BINDER'; binder: Binder }
  | { type: 'RENAME_BINDER'; binderId: string; name: string }
  | { type: 'DELETE_BINDER'; binderId: string }
  | { type: 'ADD_BINDER_PAGE'; binderId: string; page: BinderPage }
  | { type: 'REMOVE_BINDER_PAGE'; binderId: string; pageId: string }
  | { type: 'ASSIGN_BINDER_SLOT'; binderId: string; pageId: string; slotIndex: number; entry: BinderSlot | null }
  | { type: 'MOVE_BINDER_SLOT'; binderId: string; fromPageId: string; fromSlot: number; toPageId: string; toSlot: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortCopies(copies: ConditionCopy[]): ConditionCopy[] {
  return [...copies].sort(
    (a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition),
  );
}

function mergeCopies(existing: ConditionCopy[], incoming: ConditionCopy[]): ConditionCopy[] {
  const map = new Map<Condition, number>();
  for (const c of existing) map.set(c.condition, (map.get(c.condition) ?? 0) + c.quantity);
  for (const c of incoming) map.set(c.condition, (map.get(c.condition) ?? 0) + c.quantity);
  return sortCopies(
    Array.from(map.entries()).map(([condition, quantity]) => ({ condition, quantity })),
  );
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.state;

    case 'ADD_TO_COLLECTION': {
      const existing = state.collection.find((e) => e.id === action.entry.id);
      if (existing) {
        return {
          ...state,
          collection: state.collection.map((e) =>
            e.id === action.entry.id
              ? { ...e, copies: mergeCopies(e.copies, action.entry.copies) }
              : e,
          ),
        };
      }
      return { ...state, collection: [...state.collection, action.entry] };
    }

    case 'UPDATE_COLLECTION_COPIES':
      return {
        ...state,
        collection: state.collection.map((e) =>
          e.id === action.id ? { ...e, copies: sortCopies(action.copies) } : e,
        ),
      };

    case 'UPDATE_COLLECTION_NOTES':
      return {
        ...state,
        collection: state.collection.map((e) =>
          e.id === action.id ? { ...e, notes: action.notes } : e,
        ),
      };

    case 'REMOVE_FROM_COLLECTION':
      return { ...state, collection: state.collection.filter((e) => e.id !== action.id) };

    case 'REMOVE_COLLECTION_COPIES': {
      const entry = state.collection.find((e) => e.id === action.id);
      if (!entry) return state;
      let updated: ConditionCopy[];
      if (action.condition) {
        updated = entry.copies.reduce<ConditionCopy[]>((acc, copy) => {
          if (copy.condition !== action.condition) { acc.push(copy); return acc; }
          const newQty = copy.quantity - action.amount;
          if (newQty > 0) acc.push({ ...copy, quantity: newQty });
          return acc;
        }, []);
      } else {
        let remaining = action.amount;
        updated = [...entry.copies]
          .sort((a, b) => CONDITION_ORDER.indexOf(b.condition) - CONDITION_ORDER.indexOf(a.condition))
          .reduce<ConditionCopy[]>((acc, copy) => {
            if (remaining <= 0) { acc.push(copy); return acc; }
            const removed = Math.min(remaining, copy.quantity);
            remaining -= removed;
            if (copy.quantity - removed > 0) acc.push({ ...copy, quantity: copy.quantity - removed });
            return acc;
          }, [])
          .sort((a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition));
      }
      if (updated.length === 0) {
        return { ...state, collection: state.collection.filter((e) => e.id !== action.id) };
      }
      return {
        ...state,
        collection: state.collection.map((e) => e.id === action.id ? { ...e, copies: updated } : e),
      };
    }

    case 'ADD_TO_TO_GET': {
      const existing = state.toGet.find((e) => e.id === action.entry.id);
      if (existing) {
        const betterCondition =
          CONDITION_ORDER.indexOf(action.entry.minCondition) <
          CONDITION_ORDER.indexOf(existing.minCondition)
            ? action.entry.minCondition
            : existing.minCondition;
        return {
          ...state,
          toGet: state.toGet.map((e) =>
            e.id === action.entry.id
              ? { ...e, desiredQuantity: e.desiredQuantity + action.entry.desiredQuantity, minCondition: betterCondition }
              : e,
          ),
        };
      }
      return { ...state, toGet: [...state.toGet, action.entry] };
    }

    case 'UPDATE_TO_GET':
      return {
        ...state,
        toGet: state.toGet.map((e) => e.id === action.id ? { ...e, ...action.patch } : e),
      };

    case 'REMOVE_FROM_TO_GET':
      return { ...state, toGet: state.toGet.filter((e) => e.id !== action.id) };

    case 'REDUCE_TO_GET_QUANTITY': {
      const entry = state.toGet.find((e) => e.id === action.id);
      if (!entry) return state;
      const newQty = entry.desiredQuantity - action.amount;
      if (newQty <= 0) {
        return { ...state, toGet: state.toGet.filter((e) => e.id !== action.id) };
      }
      return {
        ...state,
        toGet: state.toGet.map((e) => e.id === action.id ? { ...e, desiredQuantity: newQty } : e),
      };
    }

    case 'ACQUIRE': {
      const toGetEntry = state.toGet.find((e) => e.id === action.toGetId);
      if (!toGetEntry) return state;

      const existingCollection = state.collection.find((e) => e.id === toGetEntry.id);
      const newCopies = existingCollection
        ? mergeCopies(existingCollection.copies, action.acquiredCopies)
        : sortCopies(action.acquiredCopies);
      const newTotalOwned = newCopies.reduce((sum, c) => sum + c.quantity, 0);

      const collectionEntry: CollectionEntry = {
        id: toGetEntry.id,
        cardId: toGetEntry.cardId,
        cardName: toGetEntry.cardName,
        cardImageUrl: toGetEntry.cardImageUrl,
        setName: toGetEntry.setName,
        setCode: toGetEntry.setCode,
        rarity: toGetEntry.rarity,
        copies: newCopies,
        dateAdded: new Date().toISOString(),
      };

      const nextCollection = existingCollection
        ? state.collection.map((e) => e.id === toGetEntry.id ? { ...e, copies: newCopies } : e)
        : [...state.collection, collectionEntry];

      const nextToGet = newTotalOwned >= toGetEntry.desiredQuantity
        ? state.toGet.filter((e) => e.id !== action.toGetId)
        : state.toGet;

      return { ...state, collection: nextCollection, toGet: nextToGet };
    }

    case 'CREATE_BINDER':
      return { ...state, binders: [...state.binders, action.binder] };

    case 'RENAME_BINDER':
      return {
        ...state,
        binders: state.binders.map((b) =>
          b.id === action.binderId ? { ...b, name: action.name } : b,
        ),
      };

    case 'DELETE_BINDER':
      return { ...state, binders: state.binders.filter((b) => b.id !== action.binderId) };

    case 'ADD_BINDER_PAGE':
      return {
        ...state,
        binders: state.binders.map((b) =>
          b.id === action.binderId ? { ...b, pages: [...b.pages, action.page] } : b,
        ),
      };

    case 'REMOVE_BINDER_PAGE':
      return {
        ...state,
        binders: state.binders.map((b) => {
          if (b.id !== action.binderId) return b;
          const pages = b.pages.filter((p) => p.id !== action.pageId);
          return { ...b, pages: pages.length > 0 ? pages : b.pages };
        }),
      };

    case 'ASSIGN_BINDER_SLOT':
      return {
        ...state,
        binders: state.binders.map((b) => {
          if (b.id !== action.binderId) return b;
          return {
            ...b,
            pages: b.pages.map((p) => {
              if (p.id !== action.pageId) return p;
              const slots = [...p.slots];
              slots[action.slotIndex] = action.entry;
              return { ...p, slots };
            }),
          };
        }),
      };

    case 'MOVE_BINDER_SLOT':
      return {
        ...state,
        binders: state.binders.map((b) => {
          if (b.id !== action.binderId) return b;
          const pages = b.pages.map((p) => ({ ...p, slots: [...p.slots] }));
          const fromPage = pages.find((p) => p.id === action.fromPageId);
          const toPage = pages.find((p) => p.id === action.toPageId);
          if (!fromPage || !toPage) return b;
          const tmp = fromPage.slots[action.fromSlot];
          fromPage.slots[action.fromSlot] = toPage.slots[action.toSlot];
          toPage.slots[action.toSlot] = tmp;
          return { ...b, pages };
        }),
      };

    default:
      return state;
  }
}

// ── API sync (fire-and-forget side effects) ───────────────────────────────────

async function syncToApi(action: Action, prevState: AppState): Promise<void> {
  switch (action.type) {
    case 'ADD_TO_COLLECTION':
      for (const copy of action.entry.copies) {
        await collectionApi.addCopy(action.entry, copy);
      }
      break;

    case 'REMOVE_FROM_COLLECTION': {
      const entry = prevState.collection.find((e) => e.id === action.id);
      if (entry) {
        await collectionApi.removeAllCopies(action.id, entry.copies.map((c) => c.condition));
      }
      break;
    }

    case 'REMOVE_COLLECTION_COPIES': {
      if (!action.condition) break; // worst-first multi-copy removal — skip for now
      const entry = prevState.collection.find((e) => e.id === action.id);
      const copy = entry?.copies.find((c) => c.condition === action.condition);
      if (!copy) break;
      const newQty = copy.quantity - action.amount;
      if (newQty <= 0) {
        await collectionApi.removeCopy(action.id, action.condition);
      } else {
        await collectionApi.updateCopyQuantity(action.id, action.condition, newQty);
      }
      break;
    }

    case 'UPDATE_COLLECTION_COPIES': {
      const oldEntry = prevState.collection.find((e) => e.id === action.id);
      if (!oldEntry) break;
      // Remove copies that no longer exist
      for (const old of oldEntry.copies) {
        if (!action.copies.find((c) => c.condition === old.condition)) {
          await collectionApi.removeCopy(action.id, old.condition);
        }
      }
      // Add new copies or update changed quantities
      for (const newCopy of action.copies) {
        const old = oldEntry.copies.find((c) => c.condition === newCopy.condition);
        if (!old) {
          await collectionApi.addCopy(oldEntry, newCopy);
        } else if (old.quantity !== newCopy.quantity) {
          await collectionApi.updateCopyQuantity(action.id, newCopy.condition, newCopy.quantity);
        }
      }
      break;
    }

    case 'ADD_TO_TO_GET':
      await toGetApi.add(action.entry);
      break;

    case 'UPDATE_TO_GET': {
      const patch: { condition?: Condition; quantity?: number } = {};
      if (action.patch.minCondition !== undefined) patch.condition = action.patch.minCondition;
      if (action.patch.desiredQuantity !== undefined) patch.quantity = action.patch.desiredQuantity;
      if (Object.keys(patch).length > 0) await toGetApi.update(action.id, patch);
      break;
    }

    case 'REMOVE_FROM_TO_GET':
      await toGetApi.remove(action.id);
      break;

    case 'REDUCE_TO_GET_QUANTITY': {
      const entry = prevState.toGet.find((e) => e.id === action.id);
      if (!entry) break;
      const newQty = entry.desiredQuantity - action.amount;
      if (newQty <= 0) {
        await toGetApi.remove(action.id);
      } else {
        await toGetApi.update(action.id, { quantity: newQty });
      }
      break;
    }

    case 'ACQUIRE': {
      const toGetEntry = prevState.toGet.find((e) => e.id === action.toGetId);
      if (!toGetEntry) break;

      for (const copy of action.acquiredCopies) {
        await collectionApi.addCopy(
          {
            id: toGetEntry.id,
            cardId: toGetEntry.cardId,
            cardName: toGetEntry.cardName,
            cardImageUrl: toGetEntry.cardImageUrl,
            setName: toGetEntry.setName,
            setCode: toGetEntry.setCode,
            rarity: toGetEntry.rarity,
            copies: [copy],
            dateAdded: new Date().toISOString(),
          },
          copy,
        );
      }

      // Remove toGet if fully acquired (mirrors the reducer logic)
      const existingOwned =
        prevState.collection.find((e) => e.id === toGetEntry.id)
          ?.copies.reduce((s, c) => s + c.quantity, 0) ?? 0;
      const newlyAcquired = action.acquiredCopies.reduce((s, c) => s + c.quantity, 0);
      if (existingOwned + newlyAcquired >= toGetEntry.desiredQuantity) {
        await toGetApi.remove(action.toGetId);
      }
      break;
    }

    case 'RENAME_BINDER':
      await binderApi.rename(action.binderId, action.name);
      break;

    case 'DELETE_BINDER':
      await binderApi.delete(action.binderId);
      break;

    case 'REMOVE_BINDER_PAGE': {
      await binderApi.removePage(action.binderId, action.pageId);
      break;
    }

    case 'ASSIGN_BINDER_SLOT': {
      const binder = prevState.binders.find((b) => b.id === action.binderId);
      const page = binder?.pages.find((p) => p.id === action.pageId);
      if (!binder || !page) break;
      await binderApi.setSlot(action.binderId, action.pageId, action.slotIndex, action.entry);
      break;
    }

    case 'MOVE_BINDER_SLOT': {
      const binder = prevState.binders.find((b) => b.id === action.binderId);
      if (!binder) break;
      const fromPage = binder.pages.find((p) => p.id === action.fromPageId);
      const toPage = binder.pages.find((p) => p.id === action.toPageId);
      if (!fromPage || !toPage) break;
      const fromSlot = fromPage.slots[action.fromSlot] ?? null;
      const toSlot = toPage.slots[action.toSlot] ?? null;
      await Promise.all([
        binderApi.setSlot(action.binderId, action.fromPageId, action.fromSlot, toSlot),
        binderApi.setSlot(action.binderId, action.toPageId, action.toSlot, fromSlot),
      ]);
      break;
    }

    default:
      break;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface CollectionContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  totalOwned: (entryId: string) => number;
  stillNeeded: (entry: ToGetEntry) => number;
  apiLoading: boolean;
  showSyncPrompt: boolean;
  importLocalData: () => Promise<void>;
  dismissSyncPrompt: () => void;
  createBinder: (name: string, cols: number, rows: number) => Promise<Binder | null>;
  addBinderPage: (binderId: string, slotCount: number) => Promise<BinderPage | null>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [apiLoading, setApiLoading] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [localSnapshot, setLocalSnapshot] = useState<AppState | null>(null);

  // Always-current ref so syncToApi can read prevState synchronously
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Track whether the user was previously logged in to detect transitions
  const prevLoggedIn = useRef(false);

  // Detect login / logout transitions
  useEffect(() => {
    if (authLoading) return;

    if (isLoggedIn && !prevLoggedIn.current) {
      // User just logged in (or session was restored on mount)
      prevLoggedIn.current = true;
      void loadFromApi();
    } else if (!isLoggedIn && prevLoggedIn.current) {
      // User just logged out — reset to whatever is in localStorage
      prevLoggedIn.current = false;
      dispatch({ type: 'LOAD_STATE', state: loadState() });
    }
  }, [isLoggedIn, authLoading]);

  async function loadFromApi() {
    setApiLoading(true);
    try {
      const snapshot = loadState();

      const [collection, toGet, binders] = await Promise.all([
        collectionApi.fetchAll(),
        toGetApi.fetchAll(),
        binderApi.fetchAll(),
      ]);

      dispatch({ type: 'LOAD_STATE', state: { collection, toGet, binders } });

      if (snapshot.collection.length > 0 || snapshot.toGet.length > 0 || snapshot.binders.length > 0) {
        setLocalSnapshot(snapshot);
        setShowSyncPrompt(true);
      }
    } catch (err) {
      console.error('Failed to load from API:', err);
    } finally {
      setApiLoading(false);
    }
  }

  // Guests: persist every state change to localStorage.
  // Logged-in users: the API is the source of truth — don't overwrite with local data.
  useEffect(() => {
    if (isLoggedIn || authLoading) return;
    saveState(state);
  }, [state, isLoggedIn, authLoading]);

  // Dispatch wrapper: updates local state immediately (optimistic),
  // then fires the matching API call as a side effect.
  const apiAwareDispatch = useCallback(
    (action: Action) => {
      const prevState = stateRef.current;
      dispatch(action);
      if (isLoggedIn) {
        syncToApi(action, prevState).catch((err) =>
          console.error('API sync failed for', action.type, err),
        );
      }
    },
    [isLoggedIn],
  );

  const importLocalData = useCallback(async () => {
    if (!localSnapshot) return;
    try {
      await syncApi.importLocalData(localSnapshot.collection, localSnapshot.toGet, localSnapshot.binders);
      const [collection, toGet, binders] = await Promise.all([
        collectionApi.fetchAll(),
        toGetApi.fetchAll(),
        binderApi.fetchAll(),
      ]);
      dispatch({ type: 'LOAD_STATE', state: { collection, toGet, binders } });
      // Clear localStorage so logout returns to a clean guest state
      saveState({ collection: [], toGet: [], binders: [] });
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setShowSyncPrompt(false);
      setLocalSnapshot(null);
    }
  }, [localSnapshot]);

  function localId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const createBinder = useCallback(async (name: string, cols: number, rows: number): Promise<Binder | null> => {
    if (isLoggedIn) {
      try {
        const binder = await binderApi.create(name, cols, rows);
        dispatch({ type: 'CREATE_BINDER', binder });
        return binder;
      } catch (err) {
        console.error('Failed to create binder:', err);
        return null;
      }
    } else {
      const slotCount = cols * rows;
      const binder: Binder = {
        id: localId(),
        name,
        cols,
        rows,
        createdAt: new Date().toISOString(),
        pages: [{ id: localId(), slots: Array<BinderSlot | null>(slotCount).fill(null) }],
      };
      dispatch({ type: 'CREATE_BINDER', binder });
      return binder;
    }
  }, [isLoggedIn]);

  const addBinderPage = useCallback(async (binderId: string, slotCount: number): Promise<BinderPage | null> => {
    if (isLoggedIn) {
      try {
        const page = await binderApi.addPage(binderId, slotCount);
        dispatch({ type: 'ADD_BINDER_PAGE', binderId, page });
        return page;
      } catch (err) {
        console.error('Failed to add page:', err);
        return null;
      }
    } else {
      const page: BinderPage = { id: localId(), slots: Array<BinderSlot | null>(slotCount).fill(null) };
      dispatch({ type: 'ADD_BINDER_PAGE', binderId, page });
      return page;
    }
  }, [isLoggedIn]);

  const dismissSyncPrompt = useCallback(() => {
    // Clear localStorage so logout returns to a clean guest state
    saveState({ collection: [], toGet: [], binders: [] });
    setShowSyncPrompt(false);
    setLocalSnapshot(null);
  }, []);

  const totalOwned = (entryId: string): number => {
    const entry = state.collection.find((e) => e.id === entryId);
    if (!entry) return 0;
    return entry.copies.reduce((sum, c) => sum + c.quantity, 0);
  };

  const stillNeeded = (entry: ToGetEntry): number =>
    Math.max(0, entry.desiredQuantity - totalOwned(entry.id));

  return (
    <CollectionContext.Provider
      value={{
        state,
        dispatch: apiAwareDispatch,
        totalOwned,
        stillNeeded,
        apiLoading,
        showSyncPrompt,
        importLocalData,
        dismissSyncPrompt,
        createBinder,
        addBinderPage,
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be used within CollectionProvider');
  return ctx;
}
