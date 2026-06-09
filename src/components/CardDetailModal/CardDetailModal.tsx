import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { useCardDetail } from '../../hooks/useCardDetail';
import { useCollection } from '../../context/CollectionContext';
import { useAuth } from '../../context/AuthContext';
import { getCardTypeColor, getCardTypeLabel } from '../../utils/cardTypeColors';
import { CONDITION_ORDER, CONDITION_LABELS, formatPrice } from '../../types';
import type { YGOCard, YGOCardSet, Condition } from '../../types';
import { pricesApi } from '../../services/api';
import type { PricePoint } from '../../services/api';
import { getYugipediaData, yugipediaImageUrl } from '../../services/yugipediaArtwork';
import type { GalleryEntry } from '../../services/yugipediaArtwork';
import { PriceChart } from './PriceChart';
import './CardDetailModal.css';

interface Props {
  cardId: number | null;
  initialCard?: YGOCard;
  onClose: () => void;
}

interface AddState {
  set: YGOCardSet;
  mode: 'collection' | 'wishlist';
  condition: Condition;
  quantity: number;
  artworkId: number;
  artworkUrl: string;
}

function makeEntryId(cardId: number, set: YGOCardSet): string {
  return `${cardId}-${set.set_code}-${set.set_rarity_code}`;
}

export function CardDetailModal({ cardId, initialCard, onClose }: Props) {
  const { card, loading, fetchCard } = useCardDetail();
  const { state, dispatch } = useCollection();
  const { preferredCurrency, isLoggedIn } = useAuth();

  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [headerArtUrl, setHeaderArtUrl] = useState<string | null>(null);
  const [setFilter, setSetFilter] = useState('');
  const [addState, setAddState] = useState<AddState | null>(null);
  const [setArtworkMap, setSetArtworkMap] = useState<Map<string, number>>(new Map());
  const [galleryMap, setGalleryMap] = useState<Map<string, GalleryEntry>>(new Map());

  // Exchange rates — fetched once per modal open, used to convert prices in the table
  const [rates, setRates] = useState<Record<string, number>>({});

  // Price history chart state
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, PricePoint[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (cardId !== null) fetchCard(cardId);
    setSelectedImageIdx(0);
    setHeaderArtUrl(null);
    setSetFilter('');
    setAddState(null);
    setExpandedSet(null);
    setSetArtworkMap(new Map());
    setGalleryMap(new Map());
  }, [cardId, fetchCard]);

  // Fetch exchange rates on open — public endpoint, works for guests too
  useEffect(() => {
    pricesApi.getLatestRates().then(setRates).catch(() => {});
  }, []);

  // Fetch Yugipedia set→artwork map when a multi-art card loads
  useEffect(() => {
    const name = card?.name ?? initialCard?.name;
    const imgCount = Math.max(
      card?.card_images?.length ?? 0,
      initialCard?.card_images?.length ?? 0,
    );
    if (!name || imgCount <= 1) return;
    getYugipediaData(name).then(({ artMap, galleryMap: gm }) => {
      setSetArtworkMap(artMap);
      setGalleryMap(gm);
    });
  }, [card?.name, initialCard?.name]);

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

  const toggleHistory = useCallback(async (set: YGOCardSet, cardIdNum: number) => {
    const key = `${set.set_code}|${set.set_rarity}`;

    if (expandedSet === key) {
      setExpandedSet(null);
      return;
    }

    setExpandedSet(key);

    if (!isLoggedIn) return;
    if (historyMap[key] !== undefined) return;

    setHistoryLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const data = await pricesApi.getHistory(cardIdNum, set.set_code, set.set_rarity);
      setHistoryMap((prev) => ({ ...prev, [key]: data }));
    } catch {
      setHistoryMap((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setHistoryLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [expandedSet, historyMap, isLoggedIn]);

  const headerCard = card ?? initialCard ?? null;
  const fullSets = card?.card_sets ?? null;

  const typeColor = headerCard ? getCardTypeColor(headerCard.frameType) : { bg: '#555', text: '#fff' };
  const typeLabel = headerCard ? getCardTypeLabel(headerCard.type, headerCard.frameType) : '';

  // YGOPRODeck's ?id= endpoint strips alternate artworks; the ?fname= search endpoint
  // returns all of them. initialCard comes from search, so prefer whichever has more images.
  const ci = card?.card_images ?? [];
  const ii = initialCard?.card_images ?? [];
  const images = ii.length > ci.length ? ii : (ci.length > 0 ? ci : ii);

  const selectedImage = images[selectedImageIdx] ?? images[0];

  // Total artwork count: max of what YGOPRODeck provides and what Yugipedia artMap reveals.
  const totalArtworks = useMemo(() => {
    if (setArtworkMap.size === 0) return images.length;
    const maxArtIdx = Math.max(...setArtworkMap.values());
    return Math.max(images.length, maxArtIdx + 1);
  }, [images.length, setArtworkMap]);

  // Returns the best available image URL for a given artwork index.
  // YGOPRODeck first; if the index is beyond what YGOPRODeck has, looks up a representative
  // Yugipedia CDN URL from galleryMap. Returns '' (not images[0]) when nothing is found,
  // so callers can detect a missing image rather than silently getting the first artwork.
  const getArtworkUrl = useCallback((artIdx: number, full = false): string => {
    const ygp = images[artIdx];
    if (ygp) return full ? ygp.image_url : ygp.image_url_small;
    for (const [setPrefix, idx] of setArtworkMap) {
      if (idx !== artIdx) continue;
      const pfx = `${setPrefix}|`;
      for (const [key, entry] of galleryMap) {
        if (key.startsWith(pfx)) {
          const url = entry.baseUrl ?? entry.altUrl;
          if (url) return url;
        }
      }
    }
    return '';
  }, [images, setArtworkMap, galleryMap]);

  // Deduplicated picker indices: skip any artwork index that has no image or resolves to a
  // URL already shown by an earlier index (Yugipedia missing entries fall back identically).
  const artworkIndices = useMemo(() => {
    const seen = new Set<string>();
    const result: number[] = [];
    for (let i = 0; i < totalArtworks; i++) {
      const url = getArtworkUrl(i);
      if (url && !seen.has(url)) {
        seen.add(url);
        result.push(i);
      }
    }
    return result;
  }, [totalArtworks, getArtworkUrl]);

  const filteredSets = (fullSets ?? []).filter((s) =>
    setFilter === '' ||
    s.set_name.toLowerCase().includes(setFilter.toLowerCase()) ||
    s.set_code.toLowerCase().includes(setFilter.toLowerCase()) ||
    s.set_rarity.toLowerCase().includes(setFilter.toLowerCase()),
  );

  const openAddForm = (set: YGOCardSet, mode: 'collection' | 'wishlist') => {
    const setPrefix = set.set_code.split('-')[0];
    const effectiveIdx = setArtworkMap.get(setPrefix) ?? 0;
    const effectiveImage = images[effectiveIdx] ?? images[0];
    const ygpUrl = yugipediaImageUrl(galleryMap, setPrefix, set.set_rarity, effectiveIdx);
    setAddState({
      set, mode, condition: 'NM', quantity: 1,
      artworkId: effectiveImage?.id ?? 0,
      artworkUrl: ygpUrl ?? effectiveImage?.image_url ?? effectiveImage?.image_url_small ?? '',
    });
  };

  const submitAdd = () => {
    if (!addState || !headerCard) return;
    const { set, mode, condition, quantity, artworkId, artworkUrl } = addState;
    const entryId = makeEntryId(headerCard.id, set);

    if (mode === 'collection') {
      dispatch({
        type: 'ADD_TO_COLLECTION',
        entry: {
          id: entryId,
          cardId: headerCard.id,
          cardName: headerCard.name,
          cardImageUrl: artworkUrl,
          artworkId,
          setName: set.set_name,
          setCode: set.set_code,
          rarity: set.set_rarity,
          copies: [{ condition, quantity }],
          dateAdded: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_TO_WISHLIST',
        entry: {
          id: entryId,
          cardId: headerCard.id,
          cardName: headerCard.name,
          cardImageUrl: artworkUrl,
          artworkId,
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

  const colCount = artworkIndices.length > 1 ? 6 : 5;
  const mainArtUrl = addState?.artworkUrl || headerArtUrl || getArtworkUrl(selectedImageIdx, true);

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
          {!headerCard && (
            <div className="spinner-center"><div className="spinner" /></div>
          )}

          {headerCard && (
            <>
              {/* ── Card header: image + meta ── */}
              <div className="card-detail__header">
                <div className="card-detail__image-col">
                  {mainArtUrl ? (
                    <div className="card-detail__image">
                      <img src={mainArtUrl} alt={headerCard.name} />
                    </div>
                  ) : (
                    <div className="card-detail__image-placeholder">No image</div>
                  )}

                  {artworkIndices.length > 1 && !addState && (
                    <div className="card-detail__artworks">
                      <span className="card-detail__artworks-label">View alternate arts</span>
                      {artworkIndices.map((i) => (
                        <img
                          key={i}
                          src={getArtworkUrl(i)}
                          alt={`Artwork ${i + 1}`}
                          className={`card-detail__art-thumb${!headerArtUrl && i === selectedImageIdx ? ' card-detail__art-thumb--active' : ''}`}
                          onClick={() => { setSelectedImageIdx(i); setHeaderArtUrl(null); }}
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
                    {addState.mode === 'collection' ? 'Add to Collection' : 'Add to Wishlist'}
                  </div>

                  <div className="card-detail__add-set-info">
                    <strong>{addState.set.set_name}</strong>
                    {addState.set.set_code} · {addState.set.set_rarity}
                    {parseFloat(addState.set.set_price) > 0 && (
                      <> · <span style={{ color: 'var(--accent)' }}>
                        {formatPrice(parseFloat(addState.set.set_price), preferredCurrency, rates)}
                      </span></>
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
                      {addState.mode === 'collection' ? 'Add to Collection' : 'Add to Wishlist'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Set printings table ── */}
              {!addState && (
                <>
                  <div className="card-detail__section-title">Set Printings</div>

                  {loading && !card && (
                    <div className="spinner-center" style={{ padding: '1rem' }}>
                      <div className="spinner" />
                    </div>
                  )}

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
                                {artworkIndices.length > 1 && <th className="card-detail__th-art">Art</th>}
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
                                const inWishlist = state.wishlist.some((e) => e.id === entryId);
                                const priceUsd = parseFloat(set.set_price);
                                const hasPrice = priceUsd > 0;
                                const historyKey = `${set.set_code}|${set.set_rarity}`;
                                const isExpanded = expandedSet === historyKey;

                                const setPrefix = set.set_code.split('-')[0];
                                const artIdx = setArtworkMap.get(setPrefix) ?? 0;
                                const artImg = images[artIdx] ?? images[0];
                                const ygpUrl = artworkIndices.length > 1
                                  ? yugipediaImageUrl(galleryMap, setPrefix, set.set_rarity, artIdx)
                                  : null;

                                return (
                                  <Fragment key={`${set.set_code}-${set.set_rarity_code}`}>
                                    <tr>
                                      {artworkIndices.length > 1 && (
                                        <td className="card-detail__td-art">
                                          <img
                                            src={ygpUrl ?? artImg.image_url_small}
                                            title={`Artwork ${artIdx + 1} of ${totalArtworks}`}
                                            className="card-detail__art-col-thumb"
                                            onClick={() => setHeaderArtUrl(ygpUrl ?? artImg?.image_url ?? artImg?.image_url_small ?? null)}
                                            onError={ygpUrl ? (e) => {
                                              (e.target as HTMLImageElement).src = artImg.image_url_small;
                                              (e.target as HTMLImageElement).onerror = null;
                                            } : undefined}
                                          />
                                        </td>
                                      )}
                                      <td>{set.set_name}</td>
                                      <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        {set.set_code}
                                      </td>
                                      <td>{set.set_rarity}</td>
                                      <td>
                                        <div className="card-detail__price-cell">
                                          {hasPrice ? (
                                            <>
                                              <span className="card-detail__price">
                                                {formatPrice(priceUsd, preferredCurrency, rates)}
                                              </span>
                                              <button
                                                className={`card-detail__history-btn${isExpanded ? ' card-detail__history-btn--active' : ''}`}
                                                onClick={() => void toggleHistory(set, headerCard.id)}
                                                title="Price history"
                                              >
                                                ↗
                                              </button>
                                            </>
                                          ) : (
                                            <span className="card-detail__price--none">—</span>
                                          )}
                                        </div>
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
                                            style={inWishlist ? { color: 'var(--success)', borderColor: 'var(--success)' } : {}}
                                            onClick={() => openAddForm(set, 'wishlist')}
                                          >
                                            {inWishlist ? '✓ Wishlist' : '+ Wishlist'}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Price history chart row */}
                                    {isExpanded && (
                                      <tr className="card-detail__chart-row">
                                        <td colSpan={colCount}>
                                          {!isLoggedIn ? (
                                            <div className="card-detail__chart-guest">
                                              Sign in to see price history.
                                            </div>
                                          ) : (
                                            <PriceChart
                                              history={historyMap[historyKey] ?? []}
                                              currency={preferredCurrency}
                                              loading={historyLoading[historyKey] ?? false}
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                              {filteredSets.length === 0 && (
                                <tr>
                                  <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
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
