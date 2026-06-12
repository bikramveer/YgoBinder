import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from '../context/AuthContext';
import { CONDITION_LABELS, SUPPORTED_CURRENCIES } from '../types';
import type { CollectionEntry, CurrencyCode } from '../types';
import { pricesApi } from '../services/api';
import { getPriceFromCache } from '../utils/priceCache';
import { HoloRing } from '../components/progress/HoloRing';
import { ProgressBar } from '../components/progress/ProgressBar';
import './DashboardPage.css';

const RING_R = 20;
const RING_CIRC = 2 * Math.PI * RING_R;

function formatValue(usd: number, currency: CurrencyCode, rates: Record<string, number>): string {
  const rate = currency === 'USD' ? 1 : (rates[currency] ?? 1);
  const val = usd * rate;
  const sym = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$';
  if (currency === 'JPY') return `${sym}${Math.round(val).toLocaleString()}`;
  return `${sym}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BinderRing({ pct, ownedSlots, totalSlots }: { pct: number; ownedSlots: number; totalSlots: number }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const offset = RING_CIRC * (1 - clamped);
  const active = clamped > 0;
  return (
    <div className="dashboard__binder-ring">
      <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
        <circle cx="24" cy="24" r={RING_R} className="dashboard__ring-track" />
        {active && (
          <circle
            cx="24" cy="24" r={RING_R}
            className="dashboard__ring-fill"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={offset}
            transform="rotate(-90 24 24)"
          />
        )}
        <text x="24" y="26" textAnchor="middle" className="dashboard__ring-pct">
          {Math.round(clamped * 100)}%
        </text>
        <text x="24" y="33.5" textAnchor="middle" className="dashboard__ring-sub">
          {ownedSlots}/{totalSlots}
        </text>
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const { state, stillNeeded } = useCollection();
  const { isLoggedIn, preferredCurrency } = useAuth();
  const [selectedRecent, setSelectedRecent] = useState<CollectionEntry | null>(null);
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => {
    pricesApi.getLatestRates().then(setRates).catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      pricesApi.getCollectionValue().then(setPriceMap).catch(() => {});
    } else {
      // Build from localStorage price cache for guests
      const map = new Map<string, number>();
      for (const entry of state.collection) {
        const price = getPriceFromCache(entry.cardId, entry.setCode, entry.rarity);
        if (price !== null) map.set(entry.id, price);
      }
      setPriceMap(map);
    }
  }, [isLoggedIn, state.collection]);

  const totalUnique = state.collection.length;

  const totalCopiesCount = useMemo(
    () => state.collection.reduce((s, e) => s + e.copies.reduce((ss, c) => ss + c.quantity, 0), 0),
    [state.collection],
  );

  const estValue = useMemo(() => {
    let total = 0;
    for (const entry of state.collection) {
      const price = priceMap.get(entry.id);
      if (!price) continue;
      const qty = entry.copies.reduce((s, c) => s + c.quantity, 0);
      total += price * qty;
    }
    return total;
  }, [state.collection, priceMap]);

  const binderStats = useMemo(
    () =>
      state.binders.map((binder) => {
        const allSlots = binder.pages.flatMap((p) => p.slots);
        const totalSlots = allSlots.length;
        const filledSlots = allSlots.filter(Boolean).length;
        const ownedSlots = allSlots.filter((s) => s?.source === 'collection').length;
        const wishlistSlots = allSlots.filter((s) => s?.source === 'wishlist').length;
        const pctFull = totalSlots > 0 ? filledSlots / totalSlots : 0;
        let binderValue = 0;
        for (const slot of allSlots) {
          if (slot?.source === 'collection') {
            binderValue += priceMap.get(slot.entryId) ?? 0;
          }
        }
        return { binder, totalSlots, filledSlots, ownedSlots, wishlistSlots, pctFull, binderValue };
      }),
    [state.binders, priceMap],
  );

  const wishlistProgress = useMemo(() => {
    if (state.wishlist.length === 0) return null;
    let desired = 0;
    let acquired = 0;
    for (const e of state.wishlist) {
      desired += e.desiredQuantity;
      acquired += e.desiredQuantity - stillNeeded(e);
    }
    const pct = desired > 0 ? Math.round((acquired / desired) * 100) : 0;
    return { desired, acquired, pct };
  }, [state.wishlist, stillNeeded]);

  const topNeeded = useMemo(
    () =>
      [...state.wishlist]
        .map((e) => ({ entry: e, needed: stillNeeded(e) }))
        .filter((x) => x.needed > 0)
        .sort((a, b) => b.needed - a.needed)
        .slice(0, 3),
    [state.wishlist, stillNeeded],
  );

  const recent = useMemo(
    () =>
      [...state.collection]
        .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
        .slice(0, 8),
    [state.collection],
  );

  const isEmpty = totalUnique === 0 && state.wishlist.length === 0 && state.binders.length === 0;

  return (
    <main className="page dashboard">
      <h1 className="dashboard__title" data-decode data-caret>Dashboard</h1>

      {/* ── Stats ── */}
      <div className="dashboard__stats">
        <div className="dashboard__stat-tile">
          <span className="dashboard__stat-value">{totalUnique}</span>
          <span className="dashboard__stat-label">Unique Cards</span>
        </div>
        <div className="dashboard__stat-tile">
          <span className="dashboard__stat-value">{totalCopiesCount}</span>
          <span className="dashboard__stat-label">Total Copies</span>
        </div>
        <div className="dashboard__stat-tile">
          <span className="dashboard__stat-value">{state.wishlist.length}</span>
          <span className="dashboard__stat-label">On Wishlist</span>
        </div>
        <div className="dashboard__stat-tile">
          <span className={`dashboard__stat-value${(!isLoggedIn || estValue === 0) ? ' dashboard__stat-value--dim' : ''}`}>
            {!isLoggedIn ? '$-.--' : estValue > 0 ? formatValue(estValue, preferredCurrency, rates) : '$0.00'}
          </span>
          <span className="dashboard__stat-label">Est. Value</span>
          {!isLoggedIn && (
            <span className="dashboard__stat-note">Sign in to track value</span>
          )}
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="dashboard__quick-links">
        <Link to="/search" className="btn btn-primary">Search Cards</Link>
        <Link to="/collection" className="btn btn-ghost">Collection</Link>
        <Link to="/wishlist" className="btn btn-ghost">Wishlist</Link>
        <Link to="/binder" className="btn btn-ghost">Binders</Link>
      </div>

      {/* ── Binders ── */}
      {state.binders.length > 0 && (
        <section className="dashboard__section">
          <h2 className="dashboard__section-title">Binders</h2>
          <div className="dashboard__binder-list">
            {binderStats.map(({ binder, totalSlots, filledSlots, ownedSlots, wishlistSlots, pctFull, binderValue }) => (
              <Link key={binder.id} to="/binder" className="dashboard__binder-row">
                <div className="dashboard__binder-row__info">
                  <span className="dashboard__binder-row__name">{binder.name}</span>
                  <span className="dashboard__binder-row__meta">
                    {binder.cols}×{binder.rows} · {binder.pages.length} page{binder.pages.length !== 1 ? 's' : ''}
                  </span>
                  {(ownedSlots > 0 || wishlistSlots > 0) && (
                    <span className="dashboard__binder-row__owned">
                      {ownedSlots > 0 && `${ownedSlots} owned`}
                      {ownedSlots > 0 && wishlistSlots > 0 && ' · '}
                      {wishlistSlots > 0 && `${wishlistSlots} wishlisted`}
                    </span>
                  )}
                  {isLoggedIn && binderValue > 0 && (
                    <span className="dashboard__binder-row__value">
                      {formatValue(binderValue, preferredCurrency, rates)}
                    </span>
                  )}
                </div>
                <HoloRing value={filledSlots} max={Math.max(totalSlots, 1)} size={68} sublabel={`${filledSlots}/${totalSlots}`} caption="SLOTS" />
                <span className="dashboard__binder-row__arrow">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Wishlist ── */}
      {state.wishlist.length > 0 && wishlistProgress && (
        <section className="dashboard__section">
          <h2 className="dashboard__section-title">Wishlist</h2>

          <div className="dashboard__wishlist-progress">
            <ProgressBar
              value={wishlistProgress.acquired}
              max={wishlistProgress.desired}
              label={`${wishlistProgress.acquired} of ${wishlistProgress.desired} copies acquired`}
              showPct
              holo
            />
          </div>

          {topNeeded.length > 0 && (
            <>
              <p className="dashboard__sub-label">Most needed</p>
              <div className="dashboard__needed-list">
                {topNeeded.map(({ entry, needed }) => (
                  <Link key={entry.id} to="/wishlist" className="dashboard__needed-row">
                    {entry.cardImageUrl && (
                      <img
                        className="dashboard__needed-thumb"
                        src={entry.cardImageUrl}
                        alt={entry.cardName}
                      />
                    )}
                    <div className="dashboard__needed-info">
                      <span className="dashboard__needed-name">{entry.cardName}</span>
                      <span className="dashboard__needed-set">
                        {entry.setCode} · {entry.rarity}
                      </span>
                    </div>
                    <span className="dashboard__needed-count">{needed} needed</span>
                    <span className="dashboard__needed-arrow">›</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <Link to="/wishlist" className="dashboard__section-link">View full list →</Link>
        </section>
      )}

      {/* ── Recently Added ── */}
      {recent.length > 0 && (
        <section className="dashboard__section">
          <h2 className="dashboard__section-title">Recently Added</h2>
          <div className="dashboard__recent-grid">
            {recent.map((entry) => (
              <button
                key={entry.id}
                className="dashboard__recent-card"
                title={`${entry.cardName} (${entry.setCode})`}
                onClick={() => setSelectedRecent(entry)}
              >
                {entry.cardImageUrl ? (
                  <img src={entry.cardImageUrl} alt={entry.cardName} />
                ) : (
                  <div className="dashboard__recent-card__empty">?</div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {isEmpty && (
        <div className="empty-state">
          <strong>Welcome to YgoBindr!</strong>
          <p>Head to Search to find your first card.</p>
        </div>
      )}

      {/* ── Recent card info modal ── */}
      {selectedRecent && (
        <div className="modal-backdrop" onClick={() => setSelectedRecent(null)}>
          <div className="modal dashboard__card-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__card-modal__header">
              {selectedRecent.cardImageUrl && (
                <img
                  className="dashboard__card-modal__img"
                  src={selectedRecent.cardImageUrl}
                  alt={selectedRecent.cardName}
                />
              )}
              <div className="dashboard__card-modal__info">
                <h2 className="dashboard__card-modal__name">{selectedRecent.cardName}</h2>
                <p className="dashboard__card-modal__set">{selectedRecent.setName}</p>
                <p className="dashboard__card-modal__code">
                  {selectedRecent.setCode} · {selectedRecent.rarity}
                </p>
                <p className="dashboard__card-modal__date">
                  Added {new Date(selectedRecent.dateAdded).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="dashboard__card-modal__copies">
              <p className="dashboard__card-modal__copies-label">Copies Owned</p>
              {selectedRecent.copies.map((c) => (
                <div key={c.condition} className="dashboard__card-modal__copy-row">
                  <span>{CONDITION_LABELS[c.condition]} ({c.condition})</span>
                  <span className="dashboard__card-modal__copy-qty">{c.quantity}×</span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-ghost dashboard__card-modal__close"
              onClick={() => setSelectedRecent(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
