import { useState, useMemo } from 'react';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_ORDER, CONDITION_LABELS } from '../types';
import type { CollectionEntry, Condition, ConditionCopy } from '../types';
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

export function CollectionPage() {
  const { state, dispatch } = useCollection();

  const [search,           setSearch]           = useState('');
  const [sort,             setSort]             = useState<Sort>('date_new');
  const [filterCondition,  setFilterCondition]  = useState<Condition | ''>('');
  const [filterRarity,     setFilterRarity]     = useState('');
  const [selectedEntry,    setSelectedEntry]    = useState<CollectionEntry | null>(null);

  const rarities = useMemo(
    () => [...new Set(state.collection.map((e) => e.rarity))].sort(),
    [state.collection],
  );

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
    if (filterCondition) list = list.filter((e) => e.copies.some((c) => c.condition === filterCondition));
    if (filterRarity)    list = list.filter((e) => e.rarity === filterRarity);

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

  const handleRemove = (e: React.MouseEvent, entry: CollectionEntry) => {
    e.stopPropagation();
    dispatch({ type: 'REMOVE_FROM_COLLECTION', id: entry.id });
    if (selectedEntry?.id === entry.id) setSelectedEntry(null);
  };

  const handleModalQtyChange = (condition: Condition, delta: number) => {
    if (!selectedEntry) return;
    const newCopies: ConditionCopy[] = selectedEntry.copies
      .map((c) => c.condition === condition ? { ...c, quantity: c.quantity + delta } : c)
      .filter((c) => c.quantity > 0);

    if (newCopies.length === 0) {
      dispatch({ type: 'REMOVE_FROM_COLLECTION', id: selectedEntry.id });
      setSelectedEntry(null);
    } else {
      dispatch({ type: 'UPDATE_COLLECTION_COPIES', id: selectedEntry.id, copies: newCopies });
      setSelectedEntry({ ...selectedEntry, copies: newCopies });
    }
  };

  return (
    <main className="page">
      <h1 className="page-title">My Collection</h1>

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
          <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}>
            <option value="">All rarities</option>
            {rarities.map((r) => <option key={r} value={r}>{r}</option>)}
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
            const best = bestCondition(entry);
            const total = totalCopies(entry);
            return (
              <div
                key={entry.id}
                className="collection-row"
                onClick={() => setSelectedEntry(entry)}
              >
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
                    {entry.setName} · <span className="collection-row__code">{entry.setCode}</span>
                  </span>
                  <span className="collection-row__rarity">{entry.rarity}</span>
                </div>
                <div className="collection-row__meta">
                  <span className="collection-row__condition">
                    {CONDITION_LABELS[best]} ({best})
                    {entry.copies.length > 1 && ` +${entry.copies.length - 1}`}
                  </span>
                  <span className="collection-row__qty">{total}×</span>
                  <button
                    className="btn btn-danger collection-row__remove"
                    onClick={(e) => handleRemove(e, entry)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selectedEntry && (
        <div className="modal-backdrop" onClick={() => setSelectedEntry(null)}>
          <div className="modal entry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="entry-modal__header">
              {selectedEntry.cardImageUrl && (
                <img
                  className="entry-modal__img"
                  src={selectedEntry.cardImageUrl}
                  alt={selectedEntry.cardName}
                />
              )}
              <div className="entry-modal__info">
                <h2 className="entry-modal__name">{selectedEntry.cardName}</h2>
                <p className="entry-modal__set">{selectedEntry.setName}</p>
                <p className="entry-modal__code">{selectedEntry.setCode} · {selectedEntry.rarity}</p>
                <p className="entry-modal__date">
                  Added {new Date(selectedEntry.dateAdded).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="entry-modal__section">
              <p className="entry-modal__section-label">Copies Owned</p>
              {selectedEntry.copies.map((c) => (
                <div key={c.condition} className="entry-modal__copy-row">
                  <span className="entry-modal__copy-cond">
                    {CONDITION_LABELS[c.condition]} ({c.condition})
                  </span>
                  <div className="entry-modal__qty-controls">
                    <button
                      className="entry-modal__qty-btn"
                      onClick={() => handleModalQtyChange(c.condition, -1)}
                    >−</button>
                    <span className="entry-modal__qty-val">{c.quantity}</span>
                    <button
                      className="entry-modal__qty-btn"
                      onClick={() => handleModalQtyChange(c.condition, 1)}
                    >+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="entry-modal__footer">
              <button className="btn btn-ghost" onClick={() => setSelectedEntry(null)}>Close</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: 'REMOVE_FROM_COLLECTION', id: selectedEntry.id });
                  setSelectedEntry(null);
                }}
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
