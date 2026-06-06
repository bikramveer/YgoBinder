import { useState, useMemo } from 'react';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_ORDER, CONDITION_LABELS } from '../types';
import type { CollectionEntry, Condition } from '../types';
import { exportCollection } from '../utils/exportCsv';
import './CollectionPage.css';

type Sort =
  | 'date_new' | 'date_old'
  | 'name_asc' | 'name_desc'
  | 'set_asc'
  | 'cond_best';

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'date_new',  label: 'Newest first' },
  { value: 'date_old',  label: 'Oldest first' },
  { value: 'name_asc',  label: 'Name (A→Z)' },
  { value: 'name_desc', label: 'Name (Z→A)' },
  { value: 'set_asc',   label: 'Set name' },
  { value: 'cond_best', label: 'Condition (best first)' },
];

function totalCopies(entry: CollectionEntry): number {
  return entry.copies.reduce((s, c) => s + c.quantity, 0);
}

function bestCondition(entry: CollectionEntry): Condition {
  return entry.copies.reduce(
    (best, c) =>
      CONDITION_ORDER.indexOf(c.condition) < CONDITION_ORDER.indexOf(best)
        ? c.condition
        : best,
    entry.copies[0].condition,
  );
}

type RemoveDialog = { entry: CollectionEntry; condition: Condition; amount: number } | null;

export function CollectionPage() {
  const { state, dispatch } = useCollection();

  const [search,           setSearch]           = useState('');
  const [sort,             setSort]             = useState<Sort>('date_new');
  const [filterCondition,  setFilterCondition]  = useState<Condition | ''>('');
  const [filterRarity,     setFilterRarity]     = useState('');
  const [removing,         setRemoving]         = useState<RemoveDialog>(null);
  const [selectedConditions, setSelectedConditions] = useState<Record<string, Condition>>({});

  const getSelectedCondition = (entry: CollectionEntry): Condition =>
    selectedConditions[entry.id] ?? bestCondition(entry);

  // Unique rarities present in the collection
  const rarities = useMemo(
    () => [...new Set(state.collection.map((e) => e.rarity))].sort(),
    [state.collection],
  );

  // Conditions present in the collection
  const conditionsPresent = useMemo(
    () => CONDITION_ORDER.filter((c) => state.collection.some((e) => e.copies.some((x) => x.condition === c))),
    [state.collection],
  );

  const entries = useMemo(() => {
    const q = search.toLowerCase();
    let list = state.collection.filter(
      (e) =>
        e.cardName.toLowerCase().includes(q) ||
        e.setName.toLowerCase().includes(q) ||
        e.setCode.toLowerCase().includes(q),
    );

    if (filterCondition) {
      list = list.filter((e) => e.copies.some((c) => c.condition === filterCondition));
    }
    if (filterRarity) {
      list = list.filter((e) => e.rarity === filterRarity);
    }

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc':  return a.cardName.localeCompare(b.cardName);
        case 'name_desc': return b.cardName.localeCompare(a.cardName);
        case 'date_new':  return b.dateAdded.localeCompare(a.dateAdded);
        case 'date_old':  return a.dateAdded.localeCompare(b.dateAdded);
        case 'set_asc':   return a.setName.localeCompare(b.setName);
        case 'cond_best': {
          const ai = CONDITION_ORDER.indexOf(bestCondition(a));
          const bi = CONDITION_ORDER.indexOf(bestCondition(b));
          return ai - bi;
        }
        default: return 0;
      }
    });
  }, [state.collection, search, sort, filterCondition, filterRarity]);

  const totalCopiesCount = state.collection.reduce((s, e) => s + totalCopies(e), 0);

  const handleConditionChange = (entry: CollectionEntry, cond: Condition) => {
    setSelectedConditions((prev) => ({ ...prev, [entry.id]: cond }));
    if (removing?.entry.id === entry.id) {
      const newMax = entry.copies.find((c) => c.condition === cond)?.quantity ?? 1;
      setRemoving((r) => r && { ...r, condition: cond, amount: Math.min(r.amount, newMax) });
    }
  };

  const handleRemoveClick = (entry: CollectionEntry) => {
    const cond = getSelectedCondition(entry);
    const qty = entry.copies.find((c) => c.condition === cond)?.quantity ?? 0;
    if (qty <= 1) {
      dispatch({ type: 'REMOVE_COLLECTION_COPIES', id: entry.id, amount: 1, condition: cond });
    } else {
      setRemoving({ entry, condition: cond, amount: 1 });
    }
  };

  const confirmRemove = () => {
    if (!removing) return;
    dispatch({
      type: 'REMOVE_COLLECTION_COPIES',
      id: removing.entry.id,
      amount: removing.amount,
      condition: removing.condition,
    });
    setRemoving(null);
  };

  return (
    <main className="page">
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent)' }}>
        My Collection
      </h1>

      {/* Toolbar */}
      <div className="collection-toolbar">
        <input
          className="collection-toolbar__search"
          type="search"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="collection-toolbar__controls">
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
              <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
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
        <span className="collection-toolbar__count">
          {entries.length} of {state.collection.length} · {totalCopiesCount} copies
        </span>
        {state.collection.length > 0 && (
          <button
            className="btn btn-ghost collection-toolbar__export"
            onClick={() => exportCollection(state.collection)}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Empty state */}
      {state.collection.length === 0 && (
        <div className="empty-state">
          <strong>No cards yet</strong>
          <p>Search for cards and add them to your collection.</p>
        </div>
      )}

      {state.collection.length > 0 && entries.length === 0 && (
        <div className="empty-state">
          <strong>No cards match your filters</strong>
          <p>Try adjusting your search or filters.</p>
        </div>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="collection-list">
          {entries.map((entry) => {
            const selectedCond = getSelectedCondition(entry);
            const selectedCopies = entry.copies.find((c) => c.condition === selectedCond);
            const multi = entry.copies.length > 1;

            return (
              <div key={entry.id} className="collection-row">
                {entry.cardImageUrl && (
                  <img
                    className="collection-row__thumb"
                    src={entry.cardImageUrl}
                    alt={entry.cardName}
                  />
                )}

                <div className="collection-row__info">
                  <span className="collection-row__name">{entry.cardName}</span>
                  <span className="collection-row__set">
                    {entry.setName}
                    {' · '}
                    <span style={{ fontFamily: 'monospace' }}>{entry.setCode}</span>
                  </span>
                  <span className="collection-row__rarity">{entry.rarity}</span>
                </div>

                <div className="collection-row__meta">
                  {multi ? (
                    <select
                      className="collection-row__condition-select"
                      value={selectedCond}
                      onChange={(e) => handleConditionChange(entry, e.target.value as Condition)}
                    >
                      {entry.copies.map((c) => (
                        <option key={c.condition} value={c.condition}>
                          {c.quantity}× {CONDITION_LABELS[c.condition]} ({c.condition})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="collection-row__condition-text">
                      {CONDITION_LABELS[selectedCond]} ({selectedCond})
                    </span>
                  )}

                  <span className="collection-row__qty">
                    {selectedCopies?.quantity ?? totalCopies(entry)}
                    {multi && (
                      <span className="collection-row__qty-sub"> / {totalCopies(entry)}</span>
                    )}
                  </span>

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

      {/* Remove dialog */}
      {removing && (() => {
        const copiesOfCond = removing.entry.copies.find((c) => c.condition === removing.condition);
        const maxQty = copiesOfCond?.quantity ?? 1;
        return (
          <div className="modal-backdrop" onClick={() => setRemoving(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Remove Copies</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {removing.entry.cardName} — {removing.entry.setCode}
              </p>

              {removing.entry.copies.length > 1 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                    Which condition?
                  </label>
                  <select
                    value={removing.condition}
                    onChange={(e) => {
                      const cond = e.target.value as Condition;
                      const newMax = removing.entry.copies.find((c) => c.condition === cond)?.quantity ?? 1;
                      setRemoving((r) => r && { ...r, condition: cond, amount: Math.min(r.amount, newMax) });
                    }}
                    style={{ fontSize: '0.82rem' }}
                  >
                    {removing.entry.copies.map((c) => (
                      <option key={c.condition} value={c.condition}>
                        {CONDITION_LABELS[c.condition]} ({c.condition}) — {c.quantity} {c.quantity === 1 ? 'copy' : 'copies'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  How many to remove? (you own {maxQty})
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={removing.amount}
                  onChange={(e) =>
                    setRemoving((s) =>
                      s && { ...s, amount: Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1)) }
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
        );
      })()}
    </main>
  );
}
