import { useEffect, useState } from 'react';
import { useCardDetail } from '../../hooks/useCardDetail';
import { useCollection } from '../../context/CollectionContext';
import { getCardTypeColor, getCardTypeLabel } from '../../utils/cardTypeColors';
import { CONDITION_ORDER, CONDITION_LABELS } from '../../types';
import type { YGOCard, YGOCardSet, Condition } from '../../types';
import './CardDetailModal.css';

interface Props {
  cardId: number | null;
  initialCard?: YGOCard;
  onClose: () => void;
}

interface AddState {
  set: YGOCardSet;
  mode: 'collection' | 'toget';
  condition: Condition;
  quantity: number;
}

function makeEntryId(cardId: number, set: YGOCardSet): string {
  // Include rarity code so two rarities from the same set code are separate entries.
  return `${cardId}-${set.set_code}-${set.set_rarity_code}`;
}

function formatPrice(priceStr: string): string {
  const n = parseFloat(priceStr);
  if (!n || n === 0) return '';
  return `$${n.toFixed(2)}`;
}

export function CardDetailModal({ cardId, initialCard, onClose }: Props) {
  const { card, loading, fetchCard } = useCardDetail();
  const { state, dispatch } = useCollection();

  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [setFilter, setSetFilter] = useState('');
  const [addState, setAddState] = useState<AddState | null>(null);

  useEffect(() => {
    if (cardId !== null) fetchCard(cardId);
    setSelectedImageIdx(0);
    setSetFilter('');
    setAddState(null);
  }, [cardId, fetchCard]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (addState) setAddState(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, addState]);

  // Header uses initialCard immediately so the name/image shows before the API resolves.
  // Sets table uses only the full API response so the filter always has complete data.
  const headerCard = card ?? initialCard ?? null;
  const fullSets = card?.card_sets ?? null; // null = still loading

  const typeColor = headerCard ? getCardTypeColor(headerCard.frameType) : { bg: '#555', text: '#fff' };
  const typeLabel = headerCard ? getCardTypeLabel(headerCard.type, headerCard.frameType) : '';
  const images = headerCard?.card_images ?? [];
  const selectedImage = images[selectedImageIdx] ?? images[0];

  const filteredSets = (fullSets ?? []).filter((s) =>
    setFilter === '' ||
    s.set_name.toLowerCase().includes(setFilter.toLowerCase()) ||
    s.set_code.toLowerCase().includes(setFilter.toLowerCase()) ||
    s.set_rarity.toLowerCase().includes(setFilter.toLowerCase()),
  );

  const openAddForm = (set: YGOCardSet, mode: 'collection' | 'toget') => {
    setAddState({ set, mode, condition: 'NM', quantity: 1 });
  };

  const submitAdd = () => {
    if (!addState || !headerCard) return;
    const { set, mode, condition, quantity } = addState;
    const imageUrl = selectedImage?.image_url_small ?? '';
    const entryId = makeEntryId(headerCard.id, set);

    if (mode === 'collection') {
      dispatch({
        type: 'ADD_TO_COLLECTION',
        entry: {
          id: entryId,
          cardId: headerCard.id,
          cardName: headerCard.name,
          cardImageUrl: imageUrl,
          setName: set.set_name,
          setCode: set.set_code,
          rarity: set.set_rarity,
          copies: [{ condition, quantity }],
          dateAdded: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_TO_TO_GET',
        entry: {
          id: entryId,
          cardId: headerCard.id,
          cardName: headerCard.name,
          cardImageUrl: imageUrl,
          setName: set.set_name,
          setCode: set.set_code,
          rarity: set.set_rarity,
          minCondition: condition,
          desiredQuantity: quantity,
          dateAdded: new Date().toISOString(),
        },
      });
    }
    setAddState(null);
  };

  return (
    <div className="modal-backdrop" onClick={addState ? undefined : onClose}>
      <div
        className="modal card-detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="card-detail__close" onClick={onClose} aria-label="Close">✕</button>

        <div className="card-detail">
          {/* Spinner only when we have no header data at all */}
          {!headerCard && (
            <div className="spinner-center"><div className="spinner" /></div>
          )}

          {headerCard && (
            <>
              {/* ── Card header: image + meta ── */}
              <div className="card-detail__header">
                <div className="card-detail__image-col">
                  {selectedImage ? (
                    <div className="card-detail__image">
                      <img src={selectedImage.image_url} alt={headerCard.name} />
                    </div>
                  ) : (
                    <div className="card-detail__image-placeholder">No image</div>
                  )}

                  {images.length > 1 && (
                    <div className="card-detail__artworks">
                      {images.map((img, i) => (
                        <img
                          key={img.id}
                          src={img.image_url_small}
                          alt={`Artwork ${i + 1}`}
                          className={`card-detail__art-thumb${i === selectedImageIdx ? ' card-detail__art-thumb--active' : ''}`}
                          onClick={() => setSelectedImageIdx(i)}
                          title={`Artwork ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="card-detail__meta">
                  <div className="card-detail__name">{headerCard.name}</div>
                  <span
                    className="card-detail__type-badge"
                    style={{ background: typeColor.bg, color: typeColor.text }}
                  >
                    {typeLabel}
                  </span>
                  <div className="card-detail__stats">
                    {headerCard.attribute && <span>{headerCard.attribute}</span>}
                    {headerCard.race && <span>{headerCard.race}</span>}
                    {headerCard.level !== undefined && <span>Level {headerCard.level}</span>}
                    {headerCard.rank !== undefined && <span>Rank {headerCard.rank}</span>}
                    {headerCard.linkval !== undefined && <span>Link {headerCard.linkval}</span>}
                    {headerCard.atk !== undefined && (
                      <span>ATK {headerCard.atk} / DEF {headerCard.def ?? '—'}</span>
                    )}
                  </div>
                  <div className="card-detail__desc">{headerCard.desc}</div>
                </div>
              </div>

              {/* ── Inline add form ── */}
              {addState && (
                <div className="card-detail__add-form">
                  <button className="card-detail__add-back" onClick={() => setAddState(null)}>
                    ← Back to printings
                  </button>

                  <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                    {addState.mode === 'collection' ? 'Add to Collection' : 'Add to To Get'}
                  </div>

                  <div className="card-detail__add-set-info">
                    <strong>{addState.set.set_name}</strong>
                    {addState.set.set_code} · {addState.set.set_rarity}
                    {formatPrice(addState.set.set_price) && (
                      <> · <span style={{ color: 'var(--accent)' }}>{formatPrice(addState.set.set_price)}</span></>
                    )}
                  </div>

                  <div className="card-detail__add-fields">
                    <div className="card-detail__add-field">
                      <label>{addState.mode === 'collection' ? 'Condition' : 'Min condition'}</label>
                      <select
                        value={addState.condition}
                        onChange={(e) =>
                          setAddState((s) => s && { ...s, condition: e.target.value as Condition })
                        }
                      >
                        {CONDITION_ORDER.map((c) => (
                          <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
                        ))}
                      </select>
                    </div>
                    <div className="card-detail__add-field">
                      <label>{addState.mode === 'collection' ? 'Quantity' : 'Desired qty'}</label>
                      <input
                        type="number"
                        min={1}
                        value={addState.quantity}
                        onChange={(e) =>
                          setAddState((s) => s && { ...s, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                        }
                      />
                    </div>
                  </div>

                  <div className="card-detail__add-actions">
                    <button className="btn btn-ghost" onClick={() => setAddState(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitAdd}>
                      {addState.mode === 'collection' ? 'Add to Collection' : 'Add to To Get'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Set printings table (only when add form is not open) ── */}
              {!addState && (
                <>
                  <div className="card-detail__section-title">Set Printings</div>

                  {/* Spinner while the detail API call resolves */}
                  {loading && !card && (
                    <div className="spinner-center" style={{ padding: '1rem' }}>
                      <div className="spinner" />
                    </div>
                  )}

                  {/* Sets loaded */}
                  {fullSets !== null && (
                    fullSets.length > 0 ? (
                      <>
                        <input
                          className="card-detail__set-filter"
                          type="search"
                          placeholder="Filter sets…"
                          value={setFilter}
                          onChange={(e) => setSetFilter(e.target.value)}
                        />
                        <div style={{ overflowX: 'auto' }}>
                          <table className="card-detail__sets-table">
                            <thead>
                              <tr>
                                <th>Set</th>
                                <th>Code</th>
                                <th>Rarity</th>
                                <th>Price</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSets.map((set) => {
                                const entryId = makeEntryId(headerCard.id, set);
                                const inCollection = state.collection.some((e) => e.id === entryId);
                                const inToGet = state.toGet.some((e) => e.id === entryId);
                                const price = formatPrice(set.set_price);

                                return (
                                  <tr key={`${set.set_code}-${set.set_rarity_code}`}>
                                    <td>{set.set_name}</td>
                                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                      {set.set_code}
                                    </td>
                                    <td>{set.set_rarity}</td>
                                    <td>
                                      {price
                                        ? <span className="card-detail__price">{price}</span>
                                        : <span className="card-detail__price--none">—</span>
                                      }
                                    </td>
                                    <td>
                                      <div className="card-detail__set-actions">
                                        <button
                                          className={`btn ${inCollection ? 'btn-ghost' : 'btn-primary'}`}
                                          onClick={() => openAddForm(set, 'collection')}
                                        >
                                          {inCollection ? '✓ Owned' : '+ Collection'}
                                        </button>
                                        <button
                                          className="btn btn-ghost"
                                          style={inToGet ? { color: 'var(--success)', borderColor: 'var(--success)' } : {}}
                                          onClick={() => openAddForm(set, 'toget')}
                                        >
                                          {inToGet ? '✓ To Get' : '+ To Get'}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                              {filteredSets.length === 0 && (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                                    No sets match your filter.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No set printing data available.
                      </p>
                    )
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
