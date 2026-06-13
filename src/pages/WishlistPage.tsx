import { useState, useMemo, useEffect, useCallback } from 'react';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from '../context/AuthContext';
import { CONDITION_LABELS, CONDITION_ORDER } from '../types';
import type { WishlistEntry, Condition, ConditionCopy } from '../types';
import { exportWishlist } from '../utils/exportCsv';
import { pricesApi } from '../services/api';
import type { PricePoint } from '../services/api';
import { PriceChart } from '../components/CardDetailModal/PriceChart';
import { CardDetailModal } from '../components/CardDetailModal/CardDetailModal';
import { ArtViewer } from '../components/ArtViewer/ArtViewer';
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

export function WishlistPage() {
  const { state, dispatch, stillNeeded } = useCollection();
  const { isLoggedIn, preferredCurrency } = useAuth();

  const [search,          setSearch]          = useState('');
  const [sort,            setSort]            = useState<Sort>('date_new');
  const [filterCondition, setFilterCondition] = useState<Condition | ''>('');
  const [filterRarity,    setFilterRarity]    = useState('');
  const [selectedEntry,   setSelectedEntry]   = useState<WishlistEntry | null>(null);
  const [artViewerSrc,    setArtViewerSrc]    = useState<string | null>(null);
  const [acquiring,       setAcquiring]       = useState<AcquireState>(null);
  const [viewingCardId,   setViewingCardId]   = useState<number | null>(null);
  const [priceHistory,    setPriceHistory]    = useState<PricePoint[]>([]);
  const [priceLoading,    setPriceLoading]    = useState(false);
  const [binderWarning,   setBinderWarning]   = useState<{ entry: WishlistEntry; binderNames: string[] } | null>(null);

  useEffect(() => {
    if (!selectedEntry || !isLoggedIn) {
      setPriceHistory([]);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    pricesApi.getHistory(selectedEntry.cardId, selectedEntry.setCode, selectedEntry.rarity)
      .then((h) => { if (!cancelled) { setPriceHistory(h); setPriceLoading(false); } })
      .catch(() => { if (!cancelled) { setPriceHistory([]); setPriceLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedEntry, isLoggedIn]);

  const openSelectedEntry = useCallback((entry: WishlistEntry) => {
    setSelectedEntry(entry);
    setPriceHistory([]);
  }, []);

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
    if (filterCondition) list = list.filter((e) => e.minCondition === filterCondition);
    if (filterRarity)    list = list.filter((e) => e.rarity === filterRarity);

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

  function getBinderNamesForEntry(entryId: string): string[] {
    return state.binders
      .filter((b) => b.pages.some((p) => p.slots.some((s) => s?.entryId === entryId)))
      .map((b) => b.name);
  }

  const doRemoveFromWishlist = (entryId: string) => {
    dispatch({ type: 'REMOVE_FROM_WISHLIST', id: entryId });
    if (selectedEntry?.id === entryId) setSelectedEntry(null);
  };

  const handleRemove = (e: React.MouseEvent, entry: WishlistEntry) => {
    e.stopPropagation();
    const usedIn = getBinderNamesForEntry(entry.id);
    if (usedIn.length > 0) {
      setBinderWarning({ entry, binderNames: usedIn });
      return;
    }
    doRemoveFromWishlist(entry.id);
  };

  const handleAcquireClick = (e: React.MouseEvent, entry: WishlistEntry) => {
    e.stopPropagation();
    const needed = stillNeeded(entry);
    setAcquiring({ entry, quantity: Math.max(1, needed), condition: entry.minCondition });
  };

  const confirmAcquire = () => {
    if (!acquiring) return;
    const copies: ConditionCopy[] = [{ condition: acquiring.condition, quantity: acquiring.quantity }];
    dispatch({ type: 'ACQUIRE', wishlistId: acquiring.entry.id, acquiredCopies: copies });
    if (selectedEntry?.id === acquiring.entry.id) setSelectedEntry(null);
    setAcquiring(null);
  };

  const handleModalQtyChange = (delta: number) => {
    if (!selectedEntry) return;
    const newQty = Math.max(1, selectedEntry.desiredQuantity + delta);
    dispatch({ type: 'UPDATE_WISHLIST', id: selectedEntry.id, patch: { desiredQuantity: newQty } });
    setSelectedEntry({ ...selectedEntry, desiredQuantity: newQty });
  };

  return (
    <>
    <main className="page">
      <h1 className="page-title" data-decode data-caret>Wishlist</h1>

      {/* Toolbar */}
      <div className="wishlist-toolbar">
        <div className="holo-input wishlist-toolbar__search" data-prompt>
          <span className="holo-input__prompt" aria-hidden="true">&gt;</span>
          <input
            type="search"
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="holo-input__beam" aria-hidden="true"></span>
        </div>
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
          <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}>
            <option value="">All rarities</option>
            {rarities.map((r) => <option key={r} value={r}>{r}</option>)}
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
              <div
                key={entry.id}
                className="wishlist-row"
                onClick={() => openSelectedEntry(entry)}
              >
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
                    {entry.setName} · <span className="wishlist-row__code">{entry.setCode}</span>
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
                    className="btn btn-success wishlist-row__btn"
                    onClick={(e) => handleAcquireClick(e, entry)}
                  >
                    Acquired
                  </button>
                  <button
                    className="btn btn-danger wishlist-row__btn"
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

      {/* View all printings — opens CardDetailModal by card ID */}
      {viewingCardId !== null && (
        <CardDetailModal
          cardId={viewingCardId}
          onClose={() => setViewingCardId(null)}
        />
      )}

      {/* Detail modal */}
      {selectedEntry && (
        <div className="modal-backdrop" onClick={() => setSelectedEntry(null)}>
          <div className="modal entry-modal" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const needed = stillNeeded(selectedEntry);
              return (
                <>
                  <div className="entry-modal__header">
                    {selectedEntry.cardImageUrl && (
                      <img
                        className="entry-modal__img entry-modal__img--clickable"
                        src={selectedEntry.cardImageUrl}
                        alt={selectedEntry.cardName}
                        onClick={() => setArtViewerSrc(selectedEntry.cardImageUrl)}
                      />
                    )}
                    <div className="entry-modal__info">
                      <h2 className="entry-modal__name">{selectedEntry.cardName}</h2>
                      <p className="entry-modal__set">{selectedEntry.setName}</p>
                      <p className="entry-modal__code">
                        {selectedEntry.setCode} · {selectedEntry.rarity}
                      </p>
                      <p className="entry-modal__meta-line">
                        Min condition: {CONDITION_LABELS[selectedEntry.minCondition]} ({selectedEntry.minCondition})
                      </p>
                      <p className={`entry-modal__status ${needed > 0 ? 'entry-modal__status--pending' : 'entry-modal__status--ok'}`}>
                        {needed > 0 ? `${needed} still needed` : 'Have enough ✓'}
                      </p>
                    </div>
                  </div>

                  <div className="entry-modal__section">
                    <p className="entry-modal__section-label">Desired Quantity</p>
                    <div className="entry-modal__copy-row">
                      <span className="entry-modal__copy-cond">Copies wanted</span>
                      <div className="entry-modal__qty-controls">
                        <button
                          className="entry-modal__qty-btn"
                          onClick={() => handleModalQtyChange(-1)}
                          disabled={selectedEntry.desiredQuantity <= 1}
                        >−</button>
                        <span className="entry-modal__qty-val">{selectedEntry.desiredQuantity}</span>
                        <button
                          className="entry-modal__qty-btn"
                          onClick={() => handleModalQtyChange(1)}
                        >+</button>
                      </div>
                    </div>
                  </div>

                  <div className="entry-modal__section">
                    <p className="entry-modal__section-label">Price History</p>
                    {!isLoggedIn ? (
                      <p className="entry-modal__note">Sign in to track price history.</p>
                    ) : priceLoading ? (
                      <PriceChart history={[]} currency={preferredCurrency} loading={true} />
                    ) : priceHistory.length === 0 ? (
                      <p className="entry-modal__note">
                        Price tracking begins the day you add a card to your wishlist.
                      </p>
                    ) : (
                      <PriceChart history={priceHistory} currency={preferredCurrency} loading={false} />
                    )}
                  </div>

                  <div className="entry-modal__footer">
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setSelectedEntry(null); setViewingCardId(selectedEntry.cardId); }}
                    >
                      View all printings
                    </button>
                    <button className="btn btn-ghost" onClick={() => setSelectedEntry(null)}>Close</button>
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        setAcquiring({
                          entry: selectedEntry,
                          quantity: Math.max(1, needed),
                          condition: selectedEntry.minCondition,
                        });
                        setSelectedEntry(null);
                      }}
                    >
                      Mark Acquired
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        const usedIn = getBinderNamesForEntry(selectedEntry.id);
                        if (usedIn.length > 0) {
                          setBinderWarning({ entry: selectedEntry, binderNames: usedIn });
                          setSelectedEntry(null);
                          return;
                        }
                        doRemoveFromWishlist(selectedEntry.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
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
                onChange={(e) => setAcquiring((s) => s && { ...s, condition: e.target.value as Condition })}
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

      {binderWarning && (
        <div className="modal-backdrop" onClick={() => setBinderWarning(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Remove from wishlist?</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              <strong>{binderWarning.entry.cardName}</strong> is placed in{' '}
              {binderWarning.binderNames.length === 1
                ? `your "${binderWarning.binderNames[0]}" binder`
                : `${binderWarning.binderNames.length} binders: ${binderWarning.binderNames.map((n) => `"${n}"`).join(', ')}`
              }. Removing it from your wishlist will also clear it from{' '}
              {binderWarning.binderNames.length === 1 ? 'that binder' : 'those binders'}.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setBinderWarning(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  doRemoveFromWishlist(binderWarning.entry.id);
                  setBinderWarning(null);
                }}
              >
                Remove anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    {artViewerSrc && (
      <ArtViewer src={artViewerSrc} alt={selectedEntry?.cardName ?? 'Card art'} onClose={() => setArtViewerSrc(null)} />
    )}
    </>
  );
}
