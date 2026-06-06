import { useCollection } from '../../context/CollectionContext';
import { CONDITION_LABELS, CONDITION_ORDER } from '../../types';
import type { CollectionEntry, ToGetEntry, Condition } from '../../types';
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

  const toGetEntry: ToGetEntry | undefined =
    slotData.source === 'toGet'
      ? state.toGet.find((e) => e.id === slotData.entryId)
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

  const handleToGetQtyChange = (delta: number) => {
    if (!toGetEntry) return;
    const newQty = toGetEntry.desiredQuantity + delta;
    if (newQty <= 0) {
      dispatch({ type: 'REMOVE_FROM_TO_GET', id: toGetEntry.id });
      onClose();
    } else {
      dispatch({ type: 'UPDATE_TO_GET', id: toGetEntry.id, patch: { desiredQuantity: newQty } });
    }
  };

  const handleToGetConditionChange = (condition: Condition) => {
    if (!toGetEntry) return;
    dispatch({ type: 'UPDATE_TO_GET', id: toGetEntry.id, patch: { minCondition: condition } });
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
          {toGetEntry && (
            <span className="binder-card-modal__sub">
              {toGetEntry.setName}
              <br />
              {toGetEntry.setCode} · {toGetEntry.rarity}
            </span>
          )}
          <span
            className={`binder-card-modal__badge binder-card-modal__badge--${slotData.source === 'collection' ? 'collection' : 'toget'}`}
          >
            {slotData.source === 'collection' ? 'In Collection' : 'To Get'}
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

      {/* To Get edit section */}
      {toGetEntry && (
        <div className="binder-card-modal__section">
          <div className="binder-card-modal__section-title">To Get details</div>
          <div className="binder-card-modal__copies-row">
            <span className="binder-card-modal__copies-label">Desired qty</span>
            <div className="binder-card-modal__qty-ctrl">
              <button
                className="binder-card-modal__qty-btn"
                onClick={() => handleToGetQtyChange(-1)}
                disabled={toGetEntry.desiredQuantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="binder-card-modal__qty-val">{toGetEntry.desiredQuantity}</span>
              <button
                className="binder-card-modal__qty-btn"
                onClick={() => handleToGetQtyChange(1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>
          <div className="binder-card-modal__copies-row">
            <span className="binder-card-modal__copies-label">Min condition</span>
            <select
              value={toGetEntry.minCondition}
              onChange={(e) => handleToGetConditionChange(e.target.value as Condition)}
              style={{ fontSize: '0.8rem' }}
            >
              {CONDITION_ORDER.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
              ))}
            </select>
          </div>
          <div className="binder-card-modal__copies-row" style={{ marginTop: '0.25rem' }}>
            <span className="binder-card-modal__copies-label">Still needed</span>
            <span style={{ fontWeight: 600, color: stillNeeded(toGetEntry) > 0 ? 'var(--accent)' : 'var(--success)' }}>
              {stillNeeded(toGetEntry) > 0 ? `${stillNeeded(toGetEntry)} of ${toGetEntry.desiredQuantity}` : 'Have enough'}
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
