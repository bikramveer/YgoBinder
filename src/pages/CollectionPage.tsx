import { useState } from 'react';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_ORDER, CONDITION_LABELS } from '../types';
import type { CollectionEntry, Condition } from '../types';

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

type RemoveDialog = {
  entry: CollectionEntry;
  condition: Condition;
  amount: number;
} | null;

export function CollectionPage() {
  const { state, dispatch } = useCollection();
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<RemoveDialog>(null);
  // Tracks which condition tab is active per entry in the table
  const [selectedConditions, setSelectedConditions] = useState<Record<string, Condition>>({});

  const getSelectedCondition = (entry: CollectionEntry): Condition =>
    selectedConditions[entry.id] ?? bestCondition(entry);

  const filtered = state.collection.filter((e) =>
    e.cardName.toLowerCase().includes(search.toLowerCase()) ||
    e.setName.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCards = state.collection.length;
  const totalCopiesCount = state.collection.reduce((s, e) => s + totalCopies(e), 0);

  const handleConditionChange = (entry: CollectionEntry, cond: Condition) => {
    setSelectedConditions((prev) => ({ ...prev, [entry.id]: cond }));
    // Keep the remove dialog in sync if it's open for this entry
    if (removing?.entry.id === entry.id) {
      const newMax = entry.copies.find((c) => c.condition === cond)?.quantity ?? 1;
      setRemoving((r) => r && { ...r, condition: cond, amount: Math.min(r.amount, newMax) });
    }
  };

  const handleRemoveClick = (entry: CollectionEntry) => {
    const cond = getSelectedCondition(entry);
    const qty = entry.copies.find((c) => c.condition === cond)?.quantity ?? 0;
    if (qty <= 1) {
      // Single copy of this condition — remove directly, no dialog
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

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ flex: 1, minWidth: '180px' }}
          type="search"
          placeholder="Filter by card or set name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {totalCards} unique · {totalCopiesCount} copies
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <strong>No cards yet</strong>
          <p>Search for cards and add them to your collection.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Card</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Set</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Rarity</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Condition</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Qty</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const selectedCond = getSelectedCondition(entry);
                const selectedCopies = entry.copies.find((c) => c.condition === selectedCond);
                const multi = entry.copies.length > 1;

                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {entry.cardImageUrl && (
                          <img
                            src={entry.cardImageUrl}
                            alt={entry.cardName}
                            style={{ width: 50, height: 73, objectFit: 'cover', borderRadius: 4, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                          />
                        )}
                        <span style={{ fontWeight: 600 }}>{entry.cardName}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                      {entry.setName}<br />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{entry.setCode}</span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{entry.rarity}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {multi ? (
                        <select
                          value={selectedCond}
                          onChange={(e) => handleConditionChange(entry, e.target.value as Condition)}
                          style={{ fontSize: '0.8rem' }}
                        >
                          {entry.copies.map((c) => (
                            <option key={c.condition} value={c.condition}>
                              {c.quantity}× {CONDITION_LABELS[c.condition]} ({c.condition})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{CONDITION_LABELS[selectedCond]} ({selectedCond})</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {/* Show count for the active condition */}
                      {selectedCopies?.quantity ?? totalCopies(entry)}
                      {multi && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginLeft: 4 }}>
                          / {totalCopies(entry)} total
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleRemoveClick(entry)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Remove dialog — condition-specific */}
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

              {/* Condition selector — only shown if entry has multiple conditions */}
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
