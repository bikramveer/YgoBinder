import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppState, CollectionEntry, ToGetEntry, ConditionCopy, Condition, Binder, BinderPage, BinderSlot } from '../types';
import { CONDITION_ORDER } from '../types';
import { loadState, saveState } from '../utils/storage';

// ── Actions ───────────────────────────────────────────────────────────────────

type Action =
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
  // Binder actions
  | { type: 'CREATE_BINDER'; binder: Binder }
  | { type: 'RENAME_BINDER'; binderId: string; name: string }
  | { type: 'DELETE_BINDER'; binderId: string }
  | { type: 'ADD_BINDER_PAGE'; binderId: string; page: BinderPage }
  | { type: 'REMOVE_BINDER_PAGE'; binderId: string; pageId: string }
  | { type: 'ASSIGN_BINDER_SLOT'; binderId: string; pageId: string; slotIndex: number; entry: BinderSlot | null }
  | { type: 'MOVE_BINDER_SLOT'; binderId: string; fromPageId: string; fromSlot: number; toPageId: string; toSlot: number };

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

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
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
        // Condition-specific removal
        updated = entry.copies.reduce<ConditionCopy[]>((acc, copy) => {
          if (copy.condition !== action.condition) { acc.push(copy); return acc; }
          const newQty = copy.quantity - action.amount;
          if (newQty > 0) acc.push({ ...copy, quantity: newQty });
          return acc;
        }, []);
      } else {
        // Fallback: remove from worst condition first
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
        // merge desired quantity; keep stricter (better) minCondition
        const betterCondition =
          CONDITION_ORDER.indexOf(action.entry.minCondition) <
          CONDITION_ORDER.indexOf(existing.minCondition)
            ? action.entry.minCondition
            : existing.minCondition;
        return {
          ...state,
          toGet: state.toGet.map((e) =>
            e.id === action.entry.id
              ? {
                  ...e,
                  desiredQuantity: e.desiredQuantity + action.entry.desiredQuantity,
                  minCondition: betterCondition,
                }
              : e,
          ),
        };
      }
      return { ...state, toGet: [...state.toGet, action.entry] };
    }

    case 'UPDATE_TO_GET':
      return {
        ...state,
        toGet: state.toGet.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e,
        ),
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
      // Add acquired copies to Collection without touching desiredQuantity.
      // stillNeeded is computed as (desiredQuantity - totalOwned), so it
      // updates automatically once the collection entry is updated.
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

      // Auto-remove from To Get once we own enough
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

    case 'ADD_BINDER_PAGE': {
      return {
        ...state,
        binders: state.binders.map((b) =>
          b.id === action.binderId ? { ...b, pages: [...b.pages, action.page] } : b,
        ),
      };
    }

    case 'REMOVE_BINDER_PAGE': {
      return {
        ...state,
        binders: state.binders.map((b) => {
          if (b.id !== action.binderId) return b;
          const pages = b.pages.filter((p) => p.id !== action.pageId);
          return { ...b, pages: pages.length > 0 ? pages : b.pages };
        }),
      };
    }

    case 'ASSIGN_BINDER_SLOT': {
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
    }

    case 'MOVE_BINDER_SLOT': {
      return {
        ...state,
        binders: state.binders.map((b) => {
          if (b.id !== action.binderId) return b;
          // Build a mutable copy of all pages
          const pages = b.pages.map((p) => ({ ...p, slots: [...p.slots] }));
          const fromPage = pages.find((p) => p.id === action.fromPageId);
          const toPage = pages.find((p) => p.id === action.toPageId);
          if (!fromPage || !toPage) return b;
          // Swap the two slots (handles drop-on-filled by swapping)
          const tmp = fromPage.slots[action.fromSlot];
          fromPage.slots[action.fromSlot] = toPage.slots[action.toSlot];
          toPage.slots[action.toSlot] = tmp;
          return { ...b, pages };
        }),
      };
    }

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface CollectionContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  totalOwned: (entryId: string) => number;
  stillNeeded: (entry: ToGetEntry) => number;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const totalOwned = (entryId: string): number => {
    const entry = state.collection.find((e) => e.id === entryId);
    if (!entry) return 0;
    return entry.copies.reduce((sum, c) => sum + c.quantity, 0);
  };

  const stillNeeded = (entry: ToGetEntry): number => {
    return Math.max(0, entry.desiredQuantity - totalOwned(entry.id));
  };

  return (
    <CollectionContext.Provider value={{ state, dispatch, totalOwned, stillNeeded }}>
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be used within CollectionProvider');
  return ctx;
}
