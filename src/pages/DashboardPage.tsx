import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../context/CollectionContext';
import { CONDITION_LABELS } from '../types';
import type { CollectionEntry } from '../types';
import './DashboardPage.css';

export function DashboardPage() {
  const { state, stillNeeded } = useCollection();
  const [selectedRecent, setSelectedRecent] = useState<CollectionEntry | null>(null);

  const totalUnique = state.collection.length;

  const totalCopiesCount = useMemo(
    () => state.collection.reduce((s, e) => s + e.copies.reduce((ss, c) => ss + c.quantity, 0), 0),
    [state.collection],
  );

  const binderStats = useMemo(
    () =>
      state.binders.map((binder) => {
        const totalSlots = binder.pages.reduce((s, p) => s + p.slots.length, 0);
        const filledSlots = binder.pages.reduce(
          (s, p) => s + p.slots.filter(Boolean).length,
          0,
        );
        const emptySlots = totalSlots - filledSlots;
        let slotLabel: string;
        if (totalSlots === 0) {
          slotLabel = 'No pages';
        } else if (filledSlots === totalSlots) {
          slotLabel = 'Full';
        } else if (filledSlots > emptySlots) {
          slotLabel = `${emptySlots} empty slot${emptySlots !== 1 ? 's' : ''}`;
        } else {
          slotLabel = `${filledSlots} filled slot${filledSlots !== 1 ? 's' : ''}`;
        }
        const pctFull = totalSlots > 0 ? filledSlots / totalSlots : 0;
        return { binder, slotLabel, pctFull };
      }),
    [state.binders],
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
      <h1 className="dashboard__title">Dashboard</h1>

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
          <span className="dashboard__stat-value dashboard__stat-value--dim">$-.--</span>
          <span className="dashboard__stat-label">Est. Value</span>
          <span className="dashboard__stat-note">coming soon</span>
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
            {binderStats.map(({ binder, slotLabel, pctFull }) => (
              <Link key={binder.id} to="/binder" className="dashboard__binder-row">
                <div className="dashboard__binder-row__info">
                  <span className="dashboard__binder-row__name">{binder.name}</span>
                  <span className="dashboard__binder-row__meta">
                    {binder.cols}×{binder.rows} · {binder.pages.length} page{binder.pages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="dashboard__binder-row__right">
                  <span className="dashboard__binder-row__slot-label">{slotLabel}</span>
                  <div className="dashboard__mini-bar">
                    <div
                      className="dashboard__mini-bar__fill"
                      style={{ width: `${Math.round(pctFull * 100)}%` }}
                    />
                  </div>
                </div>
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
            <div className="dashboard__progress-bar">
              <div
                className="dashboard__progress-bar__fill"
                style={{ width: `${wishlistProgress.pct}%` }}
              />
            </div>
            <span className="dashboard__progress-label">
              {wishlistProgress.acquired} of {wishlistProgress.desired} copies acquired
              <span className="dashboard__progress-pct"> · {wishlistProgress.pct}%</span>
            </span>
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
