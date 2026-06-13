import { useState, useMemo, useEffect, useCallback } from 'react';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from '../context/AuthContext';
import { CONDITION_ORDER, CONDITION_LABELS, SUPPORTED_CURRENCIES } from '../types';
import type { CollectionEntry, Condition, ConditionCopy } from '../types';
import { exportCollection } from '../utils/exportCsv';
import { pricesApi } from '../services/api';
import type { PricePoint } from '../services/api';
import { PriceChart } from '../components/CardDetailModal/PriceChart';
import { CardDetailModal } from '../components/CardDetailModal/CardDetailModal';
import { ArtViewer } from '../components/ArtViewer/ArtViewer';
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
  const { isLoggedIn, preferredCurrency } = useAuth();

  const [search,           setSearch]           = useState('');
  const [sort,             setSort]             = useState<Sort>('date_new');
  const [filterCondition,  setFilterCondition]  = useState<Condition | ''>('');
  const [filterRarity,     setFilterRarity]     = useState('');
  const [selectedEntry,    setSelectedEntry]    = useState<CollectionEntry | null>(null);
  const [artViewerSrc,     setArtViewerSrc]     = useState<string | null>(null);
  const [viewingCardId,    setViewingCardId]    = useState<number | null>(null);
  const [priceHistory,     setPriceHistory]     = useState<PricePoint[]>([]);
  const [priceLoading,     setPriceLoading]     = useState(false);
  const [binderWarning,    setBinderWarning]    = useState<{ entry: CollectionEntry; binderNames: string[] } | null>(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [editingPrice,     setEditingPrice]     = useState(false);
  const [rates,            setRates]            = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (isLoggedIn) pricesApi.getLatestRates().then(setRates).catch(() => {});
  }, [isLoggedIn]);

  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === preferredCurrency) ?? SUPPORTED_CURRENCIES[0];
  const currencyRate = preferredCurrency === 'USD' ? 1 : (rates[preferredCurrency] ?? 1);

  const openSelectedEntry = useCallback((entry: CollectionEntry) => {
    setSelectedEntry(entry);
    setPriceHistory([]);
    // Pre-populate in the user's preferred currency
    if (entry.customPriceUsd != null) {
      const inPreferred = entry.customPriceUsd * currencyRate;
      setCustomPriceInput(preferredCurrency === 'JPY' ? String(Math.round(inPreferred)) : inPreferred.toFixed(2));
    } else {
      setCustomPriceInput('');
    }
    setEditingPrice(false);
  }, [currencyRate, preferredCurrency]);

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

  function getBinderNamesForEntry(entryId: string): string[] {
    return state.binders
      .filter((b) => b.pages.some((p) => p.slots.some((s) => s?.entryId === entryId)))
      .map((b) => b.name);
  }

  const doRemoveFromCollection = (entryId: string) => {
    dispatch({ type: 'REMOVE_FROM_COLLECTION', id: entryId });
    if (selectedEntry?.id === entryId) setSelectedEntry(null);
  };

  const handleRemove = (e: React.MouseEvent, entry: CollectionEntry) => {
    e.stopPropagation();
    const usedIn = getBinderNamesForEntry(entry.id);
    if (usedIn.length > 0) {
      setBinderWarning({ entry, binderNames: usedIn });
      return;
    }
    doRemoveFromCollection(entry.id);
  };

  const handleSaveCustomPrice = () => {
    if (!selectedEntry) return;
    const parsed = parseFloat(customPriceInput);
    let valueUsd: number | null = null;
    if (customPriceInput.trim() !== '' && !isNaN(parsed) && parsed >= 0) {
      // Input is in the user's preferred currency — convert to USD for storage
      valueUsd = parsed / currencyRate;
    }
    dispatch({ type: 'SET_CUSTOM_PRICE', id: selectedEntry.id, customPriceUsd: valueUsd, list: 'collection' });
    setSelectedEntry({ ...selectedEntry, customPriceUsd: valueUsd ?? undefined });
    setEditingPrice(false);
  };

  const handleModalQtyChange = (condition: Condition, delta: number) => {
    if (!selectedEntry) return;
    const newCopies: ConditionCopy[] = selectedEntry.copies
      .map((c) => c.condition === condition ? { ...c, quantity: c.quantity + delta } : c)
      .filter((c) => c.quantity > 0);

    if (newCopies.length === 0) {
      const usedIn = getBinderNamesForEntry(selectedEntry.id);
      if (usedIn.length > 0) {
        setBinderWarning({ entry: selectedEntry, binderNames: usedIn });
        return;
      }
      doRemoveFromCollection(selectedEntry.id);
    } else {
      dispatch({ type: 'UPDATE_COLLECTION_COPIES', id: selectedEntry.id, copies: newCopies });
      setSelectedEntry({ ...selectedEntry, copies: newCopies });
    }
  };

  return (
    <>
    <main className="page">
      <h1 className="page-title" data-decode data-caret>My Collection</h1>

      {/* Toolbar */}
      <div className="collection-toolbar">
        <div className="holo-input collection-toolbar__search" data-prompt>
          <span className="holo-input__prompt" aria-hidden="true">&gt;</span>
          <input
            type="search"
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="holo-input__beam" aria-hidden="true"></span>
        </div>
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
                onClick={() => openSelectedEntry(entry)}
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

            <div className="entry-modal__section">
              <p className="entry-modal__section-label">Price History</p>
              {!isLoggedIn ? (
                <p className="entry-modal__note">Sign in to track price history.</p>
              ) : priceLoading ? (
                <PriceChart history={[]} currency={preferredCurrency} loading={true} />
              ) : priceHistory.length === 0 ? (
                <p className="entry-modal__note">
                  Price tracking begins the day you add a card to your collection.
                </p>
              ) : (
                <PriceChart history={priceHistory} currency={preferredCurrency} loading={false} />
              )}
            </div>

            {/* Custom Price — shown when logged in and either no market data or a price is already set */}
            {isLoggedIn && (!priceLoading && priceHistory.length === 0 || selectedEntry.customPriceUsd != null) && (
              <div className="entry-modal__section">
                <p className="entry-modal__section-label">Custom Price</p>
                {editingPrice ? (
                  <div className="entry-modal__custom-price-edit">
                    <span className="entry-modal__custom-price-sym">{currencyInfo.symbol}</span>
                    <input
                      className="entry-modal__custom-price-input"
                      type="number"
                      min="0"
                      step={preferredCurrency === 'JPY' ? '1' : '0.01'}
                      placeholder={preferredCurrency === 'JPY' ? '0' : '0.00'}
                      value={customPriceInput}
                      onChange={(e) => setCustomPriceInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCustomPrice(); if (e.key === 'Escape') setEditingPrice(false); }}
                      autoFocus
                    />
                    <span className="entry-modal__custom-price-sym">{preferredCurrency}</span>
                    <button className="btn btn-primary entry-modal__custom-price-save" onClick={handleSaveCustomPrice}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setEditingPrice(false)}>Cancel</button>
                  </div>
                ) : selectedEntry.customPriceUsd != null ? (
                  <div className="entry-modal__custom-price-row">
                    <span className="entry-modal__custom-price-val">
                      {currencyInfo.symbol}{(selectedEntry.customPriceUsd * currencyRate).toLocaleString(undefined, preferredCurrency === 'JPY' ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {preferredCurrency}
                    </span>
                    <button
                      className="btn btn-ghost entry-modal__custom-price-link"
                      onClick={() => {
                        const inPreferred = (selectedEntry.customPriceUsd ?? 0) * currencyRate;
                        setCustomPriceInput(preferredCurrency === 'JPY' ? String(Math.round(inPreferred)) : inPreferred.toFixed(2));
                        setEditingPrice(true);
                      }}
                    >Edit</button>
                    <button
                      className="btn btn-ghost entry-modal__custom-price-link"
                      onClick={() => { setCustomPriceInput(''); dispatch({ type: 'SET_CUSTOM_PRICE', id: selectedEntry.id, customPriceUsd: null, list: 'collection' }); setSelectedEntry({ ...selectedEntry, customPriceUsd: undefined }); }}
                    >Clear</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost entry-modal__custom-price-link"
                    onClick={() => { setCustomPriceInput(''); setEditingPrice(true); }}
                  >
                    + Set custom price
                  </button>
                )}
                <p className="entry-modal__note">No TCGPlayer price found for this printing. Set a custom price to include it in your Est. Value.</p>
              </div>
            )}

            <div className="entry-modal__footer">
              <button
                className="btn btn-ghost"
                onClick={() => { setSelectedEntry(null); setViewingCardId(selectedEntry.cardId); }}
              >
                View all printings
              </button>
              <button className="btn btn-ghost" onClick={() => setSelectedEntry(null)}>Close</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const usedIn = getBinderNamesForEntry(selectedEntry.id);
                  if (usedIn.length > 0) {
                    setBinderWarning({ entry: selectedEntry, binderNames: usedIn });
                    return;
                  }
                  doRemoveFromCollection(selectedEntry.id);
                }}
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}

      {binderWarning && (
        <div className="modal-backdrop" onClick={() => setBinderWarning(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Remove from collection?</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              <strong>{binderWarning.entry.cardName}</strong> is placed in{' '}
              {binderWarning.binderNames.length === 1
                ? `your "${binderWarning.binderNames[0]}" binder`
                : `${binderWarning.binderNames.length} binders: ${binderWarning.binderNames.map((n) => `"${n}"`).join(', ')}`
              }. Removing it from your collection will also clear it from{' '}
              {binderWarning.binderNames.length === 1 ? 'that binder' : 'those binders'}.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setBinderWarning(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  doRemoveFromCollection(binderWarning.entry.id);
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
