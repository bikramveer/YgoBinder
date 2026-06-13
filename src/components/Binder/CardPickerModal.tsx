import { useState, useEffect, useMemo, useRef } from 'react';
import { useCollection } from '../../context/CollectionContext';
import { searchCards } from '../../services/ygoprodeck';
import { getYugipediaData, yugipediaImageUrl } from '../../services/yugipediaArtwork';
import type { YugipediaData } from '../../services/yugipediaArtwork';
import { CONDITION_ORDER, CONDITION_LABELS } from '../../types';
import type { Condition, YGOCard, YGOCardSet } from '../../types';
import './CardPickerModal.css';

type Tab = 'owned' | 'wishlist' | 'all';

export interface TrayItem {
  id: string;
  entryId: string;
  source: 'collection' | 'wishlist';
  condition?: Condition;
  cardName: string;
  cardImageUrl: string;
  // Present for items from the All Cards tab that need to be added to collection/wishlist on confirm
  pendingCard?: YGOCard;
  pendingSet?: YGOCardSet;
}

interface PendingConfig {
  card: YGOCard;
  setIdx: number;
  condition: Condition;
  targetList: 'collection' | 'wishlist';
}

interface Props {
  emptySlotCount: number;
  onConfirm: (items: TrayItem[]) => void;
  onCancel: () => void;
}

function cardMatchesType(card: YGOCard, filter: string): boolean {
  if (!filter) return true;
  if (filter === 'spell') return card.frameType === 'spell';
  if (filter === 'trap') return card.frameType === 'trap';
  if (filter === 'monster') return !['spell', 'trap', 'token', 'skill'].includes(card.frameType);
  return true;
}

export function CardPickerModal({ emptySlotCount, onConfirm, onCancel }: Props) {
  const { state, dispatch } = useCollection();

  const [tab, setTab] = useState<Tab>('owned');
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [setNameFilter, setSetNameFilter] = useState('');
  const [allQuery, setAllQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [allResults, setAllResults] = useState<YGOCard[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<PendingConfig | null>(null);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [artworkData, setArtworkData] = useState<YugipediaData | null>(null);
  const [artworkLoading, setArtworkLoading] = useState(false);
  const artworkFetchRef = useRef<string | null>(null); // tracks which card name is being fetched

  // ── Usage tracking ────────────────────────────────────────────────────────

  const usageMap = useMemo(() => {
    const coll = new Map<string, number>();
    const tog = new Map<string, number>();
    const collBinders = new Map<string, Set<string>>(); // entryId → binder names
    const togBinders  = new Map<string, Set<string>>(); // entryId → binder names
    for (const binder of state.binders) {
      for (const page of binder.pages) {
        for (const slot of page.slots) {
          if (!slot) continue;
          if (slot.source === 'collection') {
            const key = `${slot.entryId}:${slot.condition ?? ''}`;
            coll.set(key, (coll.get(key) ?? 0) + 1);
            if (!collBinders.has(slot.entryId)) collBinders.set(slot.entryId, new Set());
            collBinders.get(slot.entryId)!.add(binder.name);
          } else {
            tog.set(slot.entryId, (tog.get(slot.entryId) ?? 0) + 1);
            if (!togBinders.has(slot.entryId)) togBinders.set(slot.entryId, new Set());
            togBinders.get(slot.entryId)!.add(binder.name);
          }
        }
      }
    }
    return { coll, tog, collBinders, togBinders };
  }, [state.binders]);

  function collAvailable(entryId: string, condition: Condition): number {
    const entry = state.collection.find((e) => e.id === entryId);
    if (!entry) return 0;
    const copy = entry.copies.find((c) => c.condition === condition);
    if (!copy) return 0;
    const inBinders = usageMap.coll.get(`${entryId}:${condition}`) ?? 0;
    const inTray = tray.filter((t) => t.entryId === entryId && t.condition === condition).length;
    return Math.max(0, copy.quantity - inBinders - inTray);
  }

  function wishlistAvailable(entryId: string): number {
    const entry = state.wishlist.find((e) => e.id === entryId);
    if (!entry) return 0;
    const inBinders = usageMap.tog.get(entryId) ?? 0;
    const inTray = tray.filter((t) => t.entryId === entryId && t.source === 'wishlist').length;
    return Math.max(0, entry.desiredQuantity - inBinders - inTray);
  }

  // ── Filtered lists ────────────────────────────────────────────────────────

  const q = search.toLowerCase();

  const filteredOwned = useMemo(() => {
    return state.collection.filter(
      (e) =>
        (!q || e.cardName.toLowerCase().includes(q) || e.setCode.toLowerCase().includes(q) || e.setName.toLowerCase().includes(q)) &&
        (!rarityFilter || e.rarity === rarityFilter) &&
        (!setNameFilter || e.setName === setNameFilter),
    );
  }, [state.collection, q, rarityFilter, setNameFilter]);

  const filteredWishlist = useMemo(() => {
    return state.wishlist.filter(
      (e) =>
        (!q || e.cardName.toLowerCase().includes(q) || e.setCode.toLowerCase().includes(q) || e.setName.toLowerCase().includes(q)) &&
        (!rarityFilter || e.rarity === rarityFilter) &&
        (!setNameFilter || e.setName === setNameFilter),
    );
  }, [state.wishlist, q, rarityFilter, setNameFilter]);

  // Unique filter options for current tab
  const { availableRarities, availableSets } = useMemo(() => {
    const entries = tab === 'owned' ? state.collection : state.wishlist;
    return {
      availableRarities: [...new Set(entries.map((e) => e.rarity))].sort(),
      availableSets: [...new Set(entries.map((e) => e.setName))].sort(),
    };
  }, [tab, state.collection, state.wishlist]);

  // ── All Cards search ──────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'all') {
      setAllResults([]);
      setAllLoading(false);
      return;
    }
    const controller = new AbortController();
    setAllLoading(true);
    const apiType =
      typeFilter === 'spell' ? 'Spell Card' : typeFilter === 'trap' ? 'Trap Card' : undefined;
    // Debounce only when actively searching; load immediately for default/filter-only views
    const delay = allQuery.trim() ? 350 : 0;
    const timer = setTimeout(async () => {
      try {
        const result = await searchCards(allQuery, 0, apiType);
        if (!controller.signal.aborted) {
          const data = result.data
            .filter((c) => (c.card_sets?.length ?? 0) > 0)
            .filter((c) => cardMatchesType(c, typeFilter))
            .slice(0, 24);
          setAllResults(data);
        }
      } catch {
        if (!controller.signal.aborted) setAllResults([]);
      } finally {
        if (!controller.signal.aborted) setAllLoading(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [allQuery, typeFilter, tab]);

  // ── Tray ──────────────────────────────────────────────────────────────────

  function addToTray(item: Omit<TrayItem, 'id'>) {
    if (tray.length >= emptySlotCount) return;
    setTray((prev) => [...prev, { ...item, id: `${Date.now()}-${Math.random()}` }]);
  }

  function removeFromTray(id: string) {
    setTray((prev) => prev.filter((t) => t.id !== id));
  }

  function handleConfirm() {
    // Dispatch ADD actions for "All Cards" items not yet in collection/wishlist
    for (const item of tray) {
      if (!item.pendingCard || !item.pendingSet) continue;
      const alreadyInCollection = state.collection.some((e) => e.id === item.entryId);
      const alreadyInWishlist = state.wishlist.some((e) => e.id === item.entryId);
      if (item.source === 'collection' && !alreadyInCollection) {
        dispatch({
          type: 'ADD_TO_COLLECTION',
          entry: {
            id: item.entryId,
            cardId: item.pendingCard.id,
            cardName: item.pendingCard.name,
            cardImageUrl: item.cardImageUrl,
            setName: item.pendingSet.set_name,
            setCode: item.pendingSet.set_code,
            rarity: item.pendingSet.set_rarity,
            copies: [{ condition: item.condition ?? 'NM', quantity: 1 }],
            dateAdded: new Date().toISOString(),
          },
        });
      } else if (item.source === 'wishlist' && !alreadyInWishlist) {
        dispatch({
          type: 'ADD_TO_WISHLIST',
          entry: {
            id: item.entryId,
            cardId: item.pendingCard.id,
            cardName: item.pendingCard.name,
            cardImageUrl: item.cardImageUrl,
            setName: item.pendingSet.set_name,
            setCode: item.pendingSet.set_code,
            rarity: item.pendingSet.set_rarity,
            minCondition: item.condition ?? 'NM',
            desiredQuantity: 1,
            dateAdded: new Date().toISOString(),
          },
        });
      }
    }
    onConfirm(tray);
  }

  function handleAddPendingToTray() {
    if (!pendingConfig) return;
    const sets = pendingConfig.card.card_sets ?? [];
    const selectedSet = sets[pendingConfig.setIdx];
    if (!selectedSet) return;
    const entryId = `${pendingConfig.card.id}-${selectedSet.set_code}-${selectedSet.set_rarity_code}`;
    const cardImageUrl = resolveConfigImage(pendingConfig.card, pendingConfig.setIdx);
    addToTray({
      entryId,
      source: pendingConfig.targetList,
      condition: pendingConfig.condition,
      cardName: pendingConfig.card.name,
      cardImageUrl,
      pendingCard: pendingConfig.card,
      pendingSet: selectedSet,
    });
    setPendingConfig(null);
    setArtworkData(null);
    setArtworkLoading(false);
    artworkFetchRef.current = null;
  }

  function openConfigure(card: YGOCard) {
    setArtworkData(null);
    setArtworkLoading(true);
    artworkFetchRef.current = card.name;
    setPendingConfig({ card, setIdx: 0, condition: 'NM', targetList: 'collection' });
    getYugipediaData(card.name).then((data) => {
      if (artworkFetchRef.current === card.name) {
        setArtworkData(data);
        setArtworkLoading(false);
      }
    }).catch(() => {
      if (artworkFetchRef.current === card.name) setArtworkLoading(false);
    });
  }

  function resolveConfigImage(card: YGOCard, setIdx: number): string {
    const selectedSet = card.card_sets?.[setIdx];
    if (artworkData && selectedSet) {
      const setPrefix = selectedSet.set_code.split('-')[0];
      const rarity = selectedSet.set_rarity;
      const artIdx = artworkData.artMap.get(setPrefix) ?? 0;
      const url = yugipediaImageUrl(artworkData.galleryMap, setPrefix, rarity, artIdx);
      if (url) return url;
    }
    return card.card_images[0]?.image_url_small ?? '';
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSearch('');
    setRarityFilter('');
    setSetNameFilter('');
    setPendingConfig(null);
    setArtworkData(null);
    setArtworkLoading(false);
    artworkFetchRef.current = null;
  }

  const trayFull = tray.length >= emptySlotCount;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card-picker">

      {/* Tab bar */}
      <div className="card-picker__tabs">
        {(['owned', 'wishlist', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`card-picker__tab${tab === t ? ' card-picker__tab--active' : ''}`}
            onClick={() => switchTab(t)}
          >
            {t === 'owned' ? 'Owned' : t === 'wishlist' ? 'Wishlist' : 'All Cards'}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card-picker__filters">
        {tab !== 'all' ? (
          <>
            <input
              className="card-picker__filter-search"
              type="search"
              placeholder="Search card or set…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <select
              className="card-picker__filter-select"
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
            >
              <option value="">All rarities</option>
              {availableRarities.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              className="card-picker__filter-select"
              value={setNameFilter}
              onChange={(e) => setSetNameFilter(e.target.value)}
            >
              <option value="">All sets</option>
              {availableSets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        ) : (
          <>
            <input
              className="card-picker__filter-search"
              type="search"
              placeholder="Search card database…"
              value={allQuery}
              onChange={(e) => setAllQuery(e.target.value)}
              autoFocus={!pendingConfig}
            />
            <select
              className="card-picker__filter-select card-picker__filter-select--type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              <option value="monster">Monster</option>
              <option value="spell">Spell</option>
              <option value="trap">Trap</option>
            </select>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div className="card-picker__body">

        {/* Owned tab */}
        {tab === 'owned' && (
          <div className="card-picker__grid">
            {filteredOwned.length === 0 && (
              <div className="card-picker__empty">
                {search || rarityFilter || setNameFilter
                  ? 'No cards match your filters.'
                  : 'Your collection is empty.'}
              </div>
            )}
            {filteredOwned.map((entry) => {
              const bestCondition = CONDITION_ORDER.find((c) => collAvailable(entry.id, c) > 0);
              const isFullyUsed = !bestCondition;
              return (
                <div
                  key={entry.id}
                  className={`card-picker__tile card-picker__tile--clickable${isFullyUsed ? ' card-picker__tile--used' : ''}`}
                  role="button"
                  tabIndex={trayFull || isFullyUsed ? -1 : 0}
                  aria-disabled={trayFull || isFullyUsed}
                  onClick={() => {
                    if (trayFull || isFullyUsed) return;
                    addToTray({
                      entryId: entry.id,
                      source: 'collection',
                      condition: bestCondition,
                      cardName: entry.cardName,
                      cardImageUrl: entry.cardImageUrl,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
                  }}
                >
                  <div className="card-picker__tile-img-wrap">
                    {entry.cardImageUrl
                      ? <img src={entry.cardImageUrl} alt={entry.cardName} className="card-picker__tile-img" />
                      : <div className="card-picker__tile-img-placeholder">?</div>
                    }
                  </div>
                  <div className="card-picker__tile-name">{entry.cardName}</div>
                  <div className="card-picker__tile-sub">{entry.setCode} · {entry.rarity}</div>
                  {isFullyUsed ? (
                    <div className="card-picker__tile-used-label" title={[...(usageMap.collBinders.get(entry.id) ?? [])].join(', ')}>
                      {[...(usageMap.collBinders.get(entry.id) ?? [])].join(', ') || 'In binder'}
                    </div>
                  ) : (
                    <div
                      className="card-picker__tile-conds"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {CONDITION_ORDER.filter((c) => collAvailable(entry.id, c) > 0).map((c) => {
                        const avail = collAvailable(entry.id, c);
                        return (
                          <button
                            key={c}
                            className={`card-picker__cond-chip${c === bestCondition ? ' card-picker__cond-chip--best' : ''}`}
                            onClick={() => addToTray({
                              entryId: entry.id,
                              source: 'collection',
                              condition: c,
                              cardName: entry.cardName,
                              cardImageUrl: entry.cardImageUrl,
                            })}
                            disabled={trayFull}
                            title={`${CONDITION_LABELS[c]} — ${avail} available`}
                          >
                            {c} ×{avail}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Wishlist tab */}
        {tab === 'wishlist' && (
          <div className="card-picker__grid">
            {filteredWishlist.length === 0 && (
              <div className="card-picker__empty">
                {search || rarityFilter || setNameFilter
                  ? 'No cards match your filters.'
                  : 'Your wishlist is empty.'}
              </div>
            )}
            {filteredWishlist.map((entry) => {
              const avail = wishlistAvailable(entry.id);
              const isFullyUsed = avail === 0;
              return (
                <button
                  key={entry.id}
                  className={`card-picker__tile card-picker__tile--clickable${isFullyUsed ? ' card-picker__tile--used' : ''}`}
                  onClick={() => {
                    if (isFullyUsed) return;
                    addToTray({
                      entryId: entry.id,
                      source: 'wishlist',
                      cardName: entry.cardName,
                      cardImageUrl: entry.cardImageUrl,
                    });
                  }}
                  disabled={trayFull || isFullyUsed}
                >
                  <div className="card-picker__tile-img-wrap">
                    {entry.cardImageUrl
                      ? <img src={entry.cardImageUrl} alt={entry.cardName} className="card-picker__tile-img" />
                      : <div className="card-picker__tile-img-placeholder">?</div>
                    }
                  </div>
                  <div className="card-picker__tile-name">{entry.cardName}</div>
                  <div className="card-picker__tile-sub">{entry.setCode} · {entry.rarity}</div>
                  {isFullyUsed ? (
                    <div className="card-picker__tile-used-label" title={[...(usageMap.togBinders.get(entry.id) ?? [])].join(', ')}>
                      {[...(usageMap.togBinders.get(entry.id) ?? [])].join(', ') || 'In binder'}
                    </div>
                  ) : (
                    <div className="card-picker__tile-avail">{avail} slot{avail !== 1 ? 's' : ''}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* All Cards tab — search grid */}
        {tab === 'all' && !pendingConfig && (
          <>
            {!allLoading && allResults.length > 0 && (
              <div className="card-picker__all-label">
                {allQuery.trim() ? 'Search results' : 'Popular cards'}
              </div>
            )}
          <div className="card-picker__grid">
            {allLoading && (
              <div className="card-picker__empty">
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            )}
            {!allLoading && allResults.length === 0 && (
              <div className="card-picker__empty">No cards found.</div>
            )}
            {allResults.map((card) => (
              <button
                key={card.id}
                className="card-picker__tile card-picker__tile--clickable"
                onClick={() => openConfigure(card)}
              >
                <div className="card-picker__tile-img-wrap">
                  {card.card_images[0]
                    ? <img src={card.card_images[0].image_url_small} alt={card.name} className="card-picker__tile-img" />
                    : <div className="card-picker__tile-img-placeholder">?</div>
                  }
                </div>
                <div className="card-picker__tile-name">{card.name}</div>
                <div className="card-picker__tile-sub">{card.type}</div>
              </button>
            ))}
          </div>
          </>
        )}

        {/* All Cards tab — configure panel */}
        {tab === 'all' && pendingConfig && (
          <div className="card-picker__configure">
            <button className="card-picker__back-btn" onClick={() => setPendingConfig(null)}>
              ← Back to search
            </button>

            <div className="card-picker__config-header">
              <div className="card-picker__config-img-wrap">
                <img
                  className={`card-picker__config-img${artworkLoading ? ' card-picker__config-img--loading' : ''}`}
                  src={resolveConfigImage(pendingConfig.card, pendingConfig.setIdx)}
                  alt={pendingConfig.card.name}
                />
                {artworkLoading && (
                  <div className="card-picker__config-img-spinner" aria-label="Loading set artwork…">
                    <div className="spinner" />
                  </div>
                )}
              </div>
              <div>
                <div className="card-picker__config-name">{pendingConfig.card.name}</div>
                <div className="card-picker__config-type">{pendingConfig.card.type}</div>
              </div>
            </div>

            <div className="card-picker__config-toggle">
              <button
                className={`card-picker__config-tab${pendingConfig.targetList === 'collection' ? ' card-picker__config-tab--active' : ''}`}
                onClick={() => setPendingConfig((p) => p && { ...p, targetList: 'collection' })}
              >
                Collection
              </button>
              <button
                className={`card-picker__config-tab${pendingConfig.targetList === 'wishlist' ? ' card-picker__config-tab--active' : ''}`}
                onClick={() => setPendingConfig((p) => p && { ...p, targetList: 'wishlist' })}
              >
                Wishlist
              </button>
            </div>

            <div className="card-picker__config-fields">
              <label className="card-picker__config-label">
                Set
                <select
                  value={pendingConfig.setIdx}
                  onChange={(e) => setPendingConfig((p) => p && { ...p, setIdx: Number(e.target.value) })}
                >
                  {(pendingConfig.card.card_sets ?? []).map((s, i) => (
                    <option key={`${s.set_code}-${s.set_rarity_code}`} value={i}>
                      {s.set_name} ({s.set_code}) — {s.set_rarity}
                    </option>
                  ))}
                  {(pendingConfig.card.card_sets ?? []).length === 0 && (
                    <option value={0}>No sets available</option>
                  )}
                </select>
              </label>

              <label className="card-picker__config-label">
                {pendingConfig.targetList === 'collection' ? 'Condition' : 'Min condition'}
                <select
                  value={pendingConfig.condition}
                  onChange={(e) => setPendingConfig((p) => p && { ...p, condition: e.target.value as Condition })}
                >
                  {CONDITION_ORDER.map((c) => (
                    <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={handleAddPendingToTray}
              disabled={(pendingConfig.card.card_sets ?? []).length === 0 || trayFull}
            >
              Add to tray
            </button>
          </div>
        )}
      </div>

      {/* Selection tray */}
      <div className="card-picker__tray">
        {tray.length === 0 ? (
          <div className="card-picker__tray-hint">
            Select cards above · {emptySlotCount} empty slot{emptySlotCount !== 1 ? 's' : ''} from here
          </div>
        ) : (
          <div className="card-picker__tray-chips">
            {tray.map((item) => (
              <div key={item.id} className="card-picker__chip">
                {item.cardImageUrl && (
                  <img src={item.cardImageUrl} alt={item.cardName} className="card-picker__chip-img" />
                )}
                {item.condition && (
                  <span className="card-picker__chip-cond">{item.condition}</span>
                )}
                <button
                  className="card-picker__chip-remove"
                  onClick={() => removeFromTray(item.id)}
                  aria-label={`Remove ${item.cardName}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="card-picker__tray-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={tray.length === 0}
          >
            {tray.length > 0 ? `Add ${tray.length} to binder` : 'Add to binder'}
          </button>
        </div>
      </div>
    </div>
  );
}
