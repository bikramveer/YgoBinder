import { useState, useMemo } from 'react';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_LABELS, CONDITION_ORDER } from '../types';
import type { WishlistEntry, Condition, ConditionCopy } from '../types';
import { exportWishlist } from '../utils/exportCsv';
import './WishlistPage.css';

type Sort =
  | 'date_new' | 'date_old'
  | 'name_asc' | 'name_desc'
  | 'needed_most' | 'needed_least';

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'date_new',     label: 'Newest first' },
  { value: 'date_old',     label: 'Oldest first' },
  { value: 'name_asc',     label: 'Name (A→Z)' },
  { value: 'name_desc',    label: 'Name (Z→A)' },
  { value: 'needed_most',  label: 'Most needed first' },
  { value: 'needed_least', label: 'Have enough first' },
];

type AcquireState = { entry: WishlistEntry; quantity: number; condition: Condition } | null;
type RemoveDialog = { entry: WishlistEntry; amount: number } | null;

export function WishlistPage() {
  const { state, dispatch, stillNeeded } = useCollection();

  const [search,          setSearch]          = useState('');
  const [sort,            setSort]            = useState<Sort>('date_new');
  const [filterCondition, setFilterCondition] = useState<Condition | ''>('');
  const [filterRarity,    setFilterRarity]    = useState('');
  const [acquiring,       setAcquiring]       = useState<AcquireState>(null);
  const [removing,        setRemoving]        = useState<RemoveDialog>(null);

  const rarities = useMemo(
    () => [...new Set(state.wishlist.map((e) => e.rarity))].sort(),
    [state.wishlist],
  );
  const conditionsPresent = useMemo(
    () => CONDITION_ORDER.filter((c) => state.wishlist.some((e) => e.minCondition === c)),
    [state.wishlist],
  );

  const entries = useMemo(() => {
    const q = search.toLowerCase();
    let list = state.wishlist.filter(
      (e) =>
        e.cardName.toLowerCase().includes(q) ||
        e.setName.toLowerCase().includes(q) ||
        e.setCode.toLowerCase().includes(q),
    );

    if (filterCondition) {
      list = list.filter((e) => e.minCondition === filterCondition);
    }
    if (filterRarity) {
      list = list.filter((e) => e.rarity === filterRarity);
    }

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc':     return a.cardName.localeCompare(b.cardName);
        case 'name_desc':    return b.cardName.localeCompare(a.cardName);
        case 'date_new':     return b.dateAdded.localeCompare(a.dateAdded);
        case 'date_old':     return a.dateAdded.localeCompare(b.dateAdded);
        case 'needed_most':  return stillNeeded(b) - stillNeeded(a);
        case 'needed_least': return stillNeeded(a) - stillNeeded(b);
        default: return 0;
      }
    });
  }, [state.wishlist, search, sort, filterCondition, filterRarity, stillNeeded]);

  const handleRemoveClick = (entry: WishlistEntry) => {
    if (entry.desiredQuantity === 1) {
      dispatch({ type: 'REMOVE_FROM_WISHLIST', id: entry.id });
    } else {
      setRemoving({ entry, amount: 1 });
    }
  };

  const confirmRemove = () => {
    if (!removing) return;
    dispatch({ type: 'REDUCE_WISHLIST_QUANTITY', id: removing.entry.id, amount: removing.amount });
    setRemoving(null);
  };

  const confirmAcquire = () => {
    if (!acquiring) return;
    const copies: ConditionCopy[] = [{ condition: acquiring.condition, quantity: acquiring.quantity }];
    dispatch({ type: 'ACQUIRE', wishlistId: acquiring.entry.id, acquiredCopies: copies });
    setAcquiring(null);
  };

  return (
    <main className="page">
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent)' }}>
        Wishlist
      </h1>

      {/* Toolbar */}
      <div className="wishlist-toolbar">
        <input
          className="wishlist-toolbar__search"
          type="search"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="wishlist-toolbar__controls">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={filterCondition}
            onChange={(e) => setFilterCondition(e.target.value as Condition | '')}
          >
            <option value="">All conditions</option>
            {conditionsPresent.map((c) => (
              <option key={c} value={c}>Min {CONDITION_LABELS[c]} ({c})</option>
            ))}
          </select>

          <select
            value={filterRarity}
            onChange={(e) => setFilterRarity(e.target.value)}
          >
            <option value="">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <span className="wishlist-toolbar__count">
          {entries.length} of {state.wishlist.length}
        </span>
        {state.wishlist.length > 0 && (
          <button
            className="btn btn-ghost wishlist-toolbar__export"
            onClick={() => exportWishlist(state.wishlist, state.collection)}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Empty states */}
      {state.wishlist.length === 0 && (
        <div className="empty-state">
          <strong>Nothing on your wishlist yet</strong>
          <p>Search for cards and add them to your Wishlist.</p>
        </div>
      )}

      {state.wishlist.length > 0 && entries.length === 0 && (
        <div className="empty-state">
          <strong>No cards match your filters</strong>
          <p>Try adjusting your search or filters.</p>
        </div>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="wishlist-list">
          {entries.map((entry) => {
            const needed = stillNeeded(entry);
            return (
              <div key={entry.id} className="wishlist-row">
                {entry.cardImageUrl && (
                  <img
                    className="wishlist-row__thumb"
                    src={entry.cardImageUrl}
                    alt={entry.cardName}
                  />
                )}

                <div className="wishlist-row__info">
                  <span className="wishlist-row__name">{entry.cardName}</span>
                  <span className="wishlist-row__set">
                    {entry.setName}
                    {' · '}
                    <span style={{ fontFamily: 'monospace' }}>{entry.setCode}</span>
                  </span>
                  <span className="wishlist-row__cond">
                    {entry.rarity} · Min {CONDITION_LABELS[entry.minCondition]} ({entry.minCondition})
                  </span>
                </div>

                <div className="wishlist-row__meta">
                  <span className={`wishlist-row__needed ${needed > 0 ? 'wishlist-row__needed--pending' : 'wishlist-row__needed--ok'}`}>
                    {needed > 0 ? `${needed} needed` : 'Have enough'}
                  </span>
                  <span className="wishlist-row__wanted">/ {entry.desiredQuantity} wanted</span>

                  <button
                    className="btn btn-success"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                    onClick={() =>
                      setAcquiring({
                        entry,
                        quantity: Math.max(1, needed),
                        condition: entry.minCondition,
                      })
                    }
                  >
                    Acquired
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => handleRemoveClick(entry)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Acquire dialog */}
      {acquiring && (
        <div className="modal-backdrop" onClick={() => setAcquiring(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Mark as Acquired</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {acquiring.entry.cardName} — {acquiring.entry.setCode}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                How many copies did you acquire?
              </label>
              <input
                type="number"
                min={1}
                value={acquiring.quantity}
                onChange={(e) =>
                  setAcquiring((s) => s && { ...s, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                style={{ width: '80px' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                Condition of acquired copies
              </label>
              <select
                value={acquiring.condition}
                onChange={(e) =>
                  setAcquiring((s) => s && { ...s, condition: e.target.value as Condition })
                }
              >
                {CONDITION_ORDER.map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setAcquiring(null)}>Cancel</button>
              <button className="btn btn-success" onClick={confirmAcquire}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove dialog */}
      {removing && (
        <div className="modal-backdrop" onClick={() => setRemoving(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Remove from Wishlist</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {removing.entry.cardName} — {removing.entry.setCode}
              <br />
              You want {removing.entry.desiredQuantity} copies.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                How many copies to remove from this list?
              </label>
              <input
                type="number"
                min={1}
                max={removing.entry.desiredQuantity}
                value={removing.amount}
                onChange={(e) =>
                  setRemoving((s) =>
                    s && { ...s, amount: Math.min(s.entry.desiredQuantity, Math.max(1, parseInt(e.target.value, 10) || 1)) }
                  )
                }
                style={{ width: '80px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
