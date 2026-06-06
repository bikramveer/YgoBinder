import { useState } from 'react';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_LABELS, CONDITION_ORDER } from '../types';
import type { ToGetEntry, Condition, ConditionCopy } from '../types';

type AcquireState = { entry: ToGetEntry; quantity: number; condition: Condition } | null;
type RemoveDialog = { entry: ToGetEntry; amount: number } | null;

export function ToGetPage() {
  const { state, dispatch, stillNeeded } = useCollection();
  const [search, setSearch] = useState('');
  const [acquiring, setAcquiring] = useState<AcquireState>(null);
  const [removing, setRemoving] = useState<RemoveDialog>(null);

  const filtered = state.toGet.filter((e) =>
    e.cardName.toLowerCase().includes(search.toLowerCase()) ||
    e.setName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRemoveClick = (entry: ToGetEntry) => {
    if (entry.desiredQuantity === 1) {
      dispatch({ type: 'REMOVE_FROM_TO_GET', id: entry.id });
    } else {
      setRemoving({ entry, amount: 1 });
    }
  };

  const confirmRemove = () => {
    if (!removing) return;
    dispatch({ type: 'REDUCE_TO_GET_QUANTITY', id: removing.entry.id, amount: removing.amount });
    setRemoving(null);
  };

  const confirmAcquire = () => {
    if (!acquiring) return;
    const copies: ConditionCopy[] = [{ condition: acquiring.condition, quantity: acquiring.quantity }];
    dispatch({ type: 'ACQUIRE', toGetId: acquiring.entry.id, acquiredCopies: copies });
    setAcquiring(null);
  };

  return (
    <main className="page">
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent)' }}>
        To Get
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
          {state.toGet.length} entries
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <strong>Nothing on your list yet</strong>
          <p>Search for cards and add them to your To Get list.</p>
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
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Min Condition</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Need / Want</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const needed = stillNeeded(entry);
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      {CONDITION_LABELS[entry.minCondition]} ({entry.minCondition})
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ color: needed > 0 ? 'var(--accent)' : 'var(--success)', fontWeight: 600 }}>
                        {needed > 0 ? `${needed} still needed` : 'Have enough'}
                      </span>
                      <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
                        / {entry.desiredQuantity} wanted
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-success"
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
                          onClick={() => handleRemoveClick(entry)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* Remove quantity dialog */}
      {removing && (
        <div className="modal-backdrop" onClick={() => setRemoving(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Remove from To Get</h2>
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
