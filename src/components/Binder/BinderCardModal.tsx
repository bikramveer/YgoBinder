import { useCollection } from '../../context/CollectionContext';
import { CONDITION_LABELS, CONDITION_ORDER } from '../../types';
import type { CollectionEntry, WishlistEntry, Condition } from '../../types';
import type { ResolvedSlotData } from './BinderSlot';
import './BinderCardModal.css';

interface Props {
  slotData: ResolvedSlotData;
  onRemoveFromSlot: () => void;
  onClose: () => void;
}

export function BinderCardModal({ slotData, onRemoveFromSlot, onClose }: Props) {
  const { state, dispatch, stillNeeded } = useCollection();

  const collectionEntry: CollectionEntry | undefined =
    slotData.source === 'collection'
      ? state.collection.find((e) => e.id === slotData.entryId)
      : undefined;

  const wishlistEntry: WishlistEntry | undefined =
    slotData.source === 'wishlist'
      ? state.wishlist.find((e) => e.id === slotData.entryId)
      : undefined;

  const handleAddCopy = (condition: Condition) => {
    if (!collectionEntry) return;
    const existing = collectionEntry.copies.find((c) => c.condition === condition);
    const updated = existing
      ? collectionEntry.copies.map((c) =>
          c.condition === condition ? { ...c, quantity: c.quantity + 1 } : c,
        )
      : [...collectionEntry.copies, { condition, quantity: 1 }];
    dispatch({ type: 'UPDATE_COLLECTION_COPIES', id: collectionEntry.id, copies: updated });
  };

  const handleRemoveCopy = (condition: Condition) => {
    if (!collectionEntry) return;
    dispatch({
      type: 'REMOVE_COLLECTION_COPIES',
      id: collectionEntry.id,
      amount: 1,
      condition,
    });
  };

  const handleWishlistQtyChange = (delta: number) => {
    if (!wishlistEntry) return;
    const newQty = wishlistEntry.desiredQuantity + delta;
    if (newQty <= 0) {
      dispatch({ type: 'REMOVE_FROM_WISHLIST', id: wishlistEntry.id });
      onClose();
    } else {
      dispatch({ type: 'UPDATE_WISHLIST', id: wishlistEntry.id, patch: { desiredQuantity: newQty } });
    }
  };

  const handleWishlistConditionChange = (condition: Condition) => {
    if (!wishlistEntry) return;
    dispatch({ type: 'UPDATE_WISHLIST', id: wishlistEntry.id, patch: { minCondition: condition } });
  };

  return (
    <div className="binder-card-modal">
      <div className="binder-card-modal__header">
        {slotData.cardImageUrl && (
          <img
            className="binder-card-modal__img"
            src={slotData.cardImageUrl}
            alt={slotData.cardName}
          />
        )}
        <div className="binder-card-modal__info">
          <span className="binder-card-modal__name">{slotData.cardName}</span>
          {collectionEntry && (
            <span className="binder-card-modal__sub">
              {collectionEntry.setName}
              <br />
              {collectionEntry.setCode} · {collectionEntry.rarity}
              {slotData.condition && (
                <>
                  <br />
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    In slot: {CONDITION_LABELS[slotData.condition]} ({slotData.condition})
                  </span>
                </>
              )}
            </span>
          )}
          {wishlistEntry && (
            <span className="binder-card-modal__sub">
              {wishlistEntry.setName}
              <br />
              {wishlistEntry.setCode} · {wishlistEntry.rarity}
            </span>
          )}
          <span
            className={`binder-card-modal__badge binder-card-modal__badge--${slotData.source === 'collection' ? 'collection' : 'wishlist'}`}
          >
            {slotData.source === 'collection' ? 'In Collection' : 'Wishlist'}
          </span>
        </div>
      </div>

      {/* Collection edit section */}
      {collectionEntry && (
        <div className="binder-card-modal__section">
          <div className="binder-card-modal__section-title">Copies owned</div>
          {CONDITION_ORDER.filter((c) =>
            collectionEntry.copies.some((x) => x.condition === c),
          ).map((c) => {
            const copy = collectionEntry.copies.find((x) => x.condition === c)!;
            return (
              <div key={c} className="binder-card-modal__copies-row">
                <span className="binder-card-modal__copies-label">
                  {CONDITION_LABELS[c]} ({c})
                </span>
                <div className="binder-card-modal__qty-ctrl">
                  <button
                    className="binder-card-modal__qty-btn"
                    onClick={() => handleRemoveCopy(c)}
                    aria-label="Remove copy"
                  >
                    −
                  </button>
                  <span className="binder-card-modal__qty-val">{copy.quantity}</span>
                  <button
                    className="binder-card-modal__qty-btn"
                    onClick={() => handleAddCopy(c)}
                    aria-label="Add copy"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wishlist edit section */}
      {wishlistEntry && (
        <div className="binder-card-modal__section">
          <div className="binder-card-modal__section-title">Wishlist details</div>
          <div className="binder-card-modal__copies-row">
            <span className="binder-card-modal__copies-label">Desired qty</span>
            <div className="binder-card-modal__qty-ctrl">
              <button
                className="binder-card-modal__qty-btn"
                onClick={() => handleWishlistQtyChange(-1)}
                disabled={wishlistEntry.desiredQuantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="binder-card-modal__qty-val">{wishlistEntry.desiredQuantity}</span>
              <button
                className="binder-card-modal__qty-btn"
                onClick={() => handleWishlistQtyChange(1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>
          <div className="binder-card-modal__copies-row">
            <span className="binder-card-modal__copies-label">Min condition</span>
            <select
              value={wishlistEntry.minCondition}
              onChange={(e) => handleWishlistConditionChange(e.target.value as Condition)}
              style={{ fontSize: '0.8rem' }}
            >
              {CONDITION_ORDER.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
              ))}
            </select>
          </div>
          <div className="binder-card-modal__copies-row" style={{ marginTop: '0.25rem' }}>
            <span className="binder-card-modal__copies-label">Still needed</span>
            <span style={{ fontWeight: 600, color: stillNeeded(wishlistEntry) > 0 ? 'var(--accent)' : 'var(--success)' }}>
              {stillNeeded(wishlistEntry) > 0 ? `${stillNeeded(wishlistEntry)} of ${wishlistEntry.desiredQuantity}` : 'Have enough'}
            </span>
          </div>
        </div>
      )}

      <div className="binder-card-modal__footer">
        <button className="btn btn-danger" onClick={onRemoveFromSlot}>
          Remove from slot
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
