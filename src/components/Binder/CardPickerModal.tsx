import { useState, useEffect, useMemo } from 'react';
import { useCollection } from '../../context/CollectionContext';
import { searchCards } from '../../services/ygoprodeck';
import { CONDITION_ORDER, CONDITION_LABELS } from '../../types';
import type { Condition, CollectionEntry, ToGetEntry, YGOCard, YGOCardSet } from '../../types';
import './CardPickerModal.css';

type Tab = 'lists' | 'addNew';

interface Props {
  onSelect: (entryId: string, source: 'collection' | 'toGet', condition?: Condition) => void;
  onCancel: () => void;
}

export function CardPickerModal({ onSelect, onCancel }: Props) {
  const { state, dispatch } = useCollection();
  const [tab, setTab] = useState<Tab>('lists');
  const [listSearch, setListSearch] = useState('');

  // "Add new" tab state
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<YGOCard[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [configCard, setConfigCard] = useState<YGOCard | null>(null);
  const [configSource, setConfigSource] = useState<'collection' | 'toGet'>('collection');
  const [configSetIdx, setConfigSetIdx] = useState(0);
  const [configCondition, setConfigCondition] = useState<Condition>('NM');

  // Compute binder slot usage counts for used-up filtering
  const usageMap = useMemo(() => {
    const coll = new Map<string, number>(); // `${entryId}:${condition}` → count
    const tog = new Map<string, number>();  // entryId → count
    for (const binder of state.binders) {
      for (const page of binder.pages) {
        for (const slot of page.slots) {
          if (!slot) continue;
          if (slot.source === 'collection') {
            const key = `${slot.entryId}:${slot.condition ?? ''}`;
            coll.set(key, (coll.get(key) ?? 0) + 1);
          } else {
            tog.set(slot.entryId, (tog.get(slot.entryId) ?? 0) + 1);
          }
        }
      }
    }
    return { coll, tog };
  }, [state.binders]);

  function collAvailable(entryId: string, condition: Condition): number {
    const entry = state.collection.find((e) => e.id === entryId);
    if (!entry) return 0;
    const copy = entry.copies.find((c) => c.condition === condition);
    if (!copy) return 0;
    const used = usageMap.coll.get(`${entryId}:${condition}`) ?? 0;
    return Math.max(0, copy.quantity - used);
  }

  function togAvailable(entryId: string): number {
    const entry = state.toGet.find((e) => e.id === entryId);
    if (!entry) return 0;
    const used = usageMap.tog.get(entryId) ?? 0;
    return Math.max(0, entry.desiredQuantity - used);
  }

  // Filter for lists tab
  const q = listSearch.toLowerCase();

  const filteredColl: CollectionEntry[] = state.collection
    .filter(
      (e) =>
        e.cardName.toLowerCase().includes(q) ||
        e.setName.toLowerCase().includes(q) ||
        e.setCode.toLowerCase().includes(q),
    )
    .filter((e) => e.copies.some((c) => collAvailable(e.id, c.condition) > 0));

  const filteredToGet: ToGetEntry[] = state.toGet
    .filter(
      (e) =>
        e.cardName.toLowerCase().includes(q) ||
        e.setName.toLowerCase().includes(q) ||
        e.setCode.toLowerCase().includes(q),
    )
    .filter((e) => togAvailable(e.id) > 0);

  // Debounced YGO API search for "Add new" tab
  useEffect(() => {
    if (tab !== 'addNew' || !addQuery.trim()) {
      setAddResults([]);
      setAddLoading(false);
      return;
    }
    const controller = new AbortController();
    setAddLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchCards(addQuery);
        if (!controller.signal.aborted) setAddResults(result.data.slice(0, 12));
      } catch {
        if (!controller.signal.aborted) setAddResults([]);
      } finally {
        if (!controller.signal.aborted) setAddLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addQuery, tab]);

  const handleSelectConfig = (card: YGOCard) => {
    setConfigCard(card);
    setConfigSetIdx(0);
    setConfigCondition('NM');
    setConfigSource('collection');
  };

  const handleAssignNew = () => {
    if (!configCard) return;
    const sets = configCard.card_sets ?? [];
    const selectedSet: YGOCardSet | undefined = sets[configSetIdx];
    if (!selectedSet) return;

    const entryId = `${configCard.id}-${selectedSet.set_code}-${selectedSet.set_rarity_code}`;

    if (configSource === 'collection') {
      const exists = state.collection.some((e) => e.id === entryId);
      if (!exists) {
        dispatch({
          type: 'ADD_TO_COLLECTION',
          entry: {
            id: entryId,
            cardId: configCard.id,
            cardName: configCard.name,
            cardImageUrl: configCard.card_images[0]?.image_url_small ?? '',
            setName: selectedSet.set_name,
            setCode: selectedSet.set_code,
            rarity: selectedSet.set_rarity,
            copies: [{ condition: configCondition, quantity: 1 }],
            dateAdded: new Date().toISOString(),
          },
        });
      }
      onSelect(entryId, 'collection', configCondition);
    } else {
      const exists = state.toGet.some((e) => e.id === entryId);
      if (!exists) {
        dispatch({
          type: 'ADD_TO_TO_GET',
          entry: {
            id: entryId,
            cardId: configCard.id,
            cardName: configCard.name,
            cardImageUrl: configCard.card_images[0]?.image_url_small ?? '',
            setName: selectedSet.set_name,
            setCode: selectedSet.set_code,
            rarity: selectedSet.set_rarity,
            minCondition: configCondition,
            desiredQuantity: 1,
            dateAdded: new Date().toISOString(),
          },
        });
      }
      onSelect(entryId, 'toGet');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="card-picker">
      <div className="card-picker__tabs">
        <button
          className={`card-picker__tab${tab === 'lists' ? ' card-picker__tab--active' : ''}`}
          onClick={() => setTab('lists')}
        >
          My Cards
        </button>
        <button
          className={`card-picker__tab${tab === 'addNew' ? ' card-picker__tab--active' : ''}`}
          onClick={() => setTab('addNew')}
        >
          Search &amp; Add
        </button>
      </div>

      {/* ── My Cards tab ── */}
      {tab === 'lists' && (
        <>
          <input
            className="card-picker__search"
            type="search"
            placeholder="Filter by card or set name…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            autoFocus
          />

          <div className="card-picker__list">
            {filteredColl.length === 0 && filteredToGet.length === 0 && (
              <div className="card-picker__empty">
                {listSearch
                  ? 'No available cards match your search.'
                  : 'No cards available to place. All copies may already be placed in binder slots, or your lists are empty.'}
              </div>
            )}

            {filteredColl.length > 0 && (
              <>
                <div className="card-picker__section-label">Collection</div>
                {filteredColl.map((entry) => (
                  <div key={entry.id} className="card-picker__entry">
                    <div className="card-picker__entry-header">
                      {entry.cardImageUrl && (
                        <img
                          className="card-picker__item-img"
                          src={entry.cardImageUrl}
                          alt={entry.cardName}
                        />
                      )}
                      <div className="card-picker__item-info">
                        <span className="card-picker__item-name">{entry.cardName}</span>
                        <span className="card-picker__item-sub">
                          {entry.setCode} · {entry.rarity}
                        </span>
                      </div>
                    </div>
                    {CONDITION_ORDER.filter((c) => {
                      const copy = entry.copies.find((x) => x.condition === c);
                      return copy && collAvailable(entry.id, c) > 0;
                    }).map((c) => {
                      const avail = collAvailable(entry.id, c);
                      return (
                        <button
                          key={c}
                          className="card-picker__condition-row"
                          onClick={() => onSelect(entry.id, 'collection', c)}
                        >
                          <span className="card-picker__cond-badge">{c}</span>
                          <span className="card-picker__cond-label">{CONDITION_LABELS[c]}</span>
                          <span className="card-picker__cond-avail">{avail} available</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            )}

            {filteredToGet.length > 0 && (
              <>
                <div className="card-picker__section-label">To Get</div>
                {filteredToGet.map((entry) => {
                  const avail = togAvailable(entry.id);
                  return (
                    <button
                      key={entry.id}
                      className="card-picker__item"
                      onClick={() => onSelect(entry.id, 'toGet')}
                    >
                      {entry.cardImageUrl && (
                        <img
                          className="card-picker__item-img"
                          src={entry.cardImageUrl}
                          alt={entry.cardName}
                        />
                      )}
                      <div className="card-picker__item-info">
                        <span className="card-picker__item-name">{entry.cardName}</span>
                        <span className="card-picker__item-sub">
                          {entry.setCode} · {entry.rarity}
                        </span>
                      </div>
                      <span className="card-picker__cond-avail">{avail} slot{avail !== 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Search & Add tab ── */}
      {tab === 'addNew' && !configCard && (
        <>
          <input
            className="card-picker__search"
            type="search"
            placeholder="Search card database…"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            autoFocus
          />

          <div className="card-picker__list">
            {addLoading && (
              <div className="card-picker__empty">
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            )}
            {!addLoading && addQuery && addResults.length === 0 && (
              <div className="card-picker__empty">No cards found.</div>
            )}
            {!addLoading && !addQuery && (
              <div className="card-picker__empty">Type a card name to search.</div>
            )}
            {addResults.map((card) => (
              <button
                key={card.id}
                className="card-picker__item"
                onClick={() => handleSelectConfig(card)}
              >
                {card.card_images[0] && (
                  <img
                    className="card-picker__item-img"
                    src={card.card_images[0].image_url_small}
                    alt={card.name}
                  />
                )}
                <div className="card-picker__item-info">
                  <span className="card-picker__item-name">{card.name}</span>
                  <span className="card-picker__item-sub">{card.type}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Configure form (after picking a card from search) ── */}
      {tab === 'addNew' && configCard && (
        <div className="card-picker__configure">
          <button
            className="card-picker__back-btn"
            onClick={() => setConfigCard(null)}
          >
            ← Back to search
          </button>

          <div className="card-picker__config-header">
            {configCard.card_images[0] && (
              <img
                className="card-picker__config-img"
                src={configCard.card_images[0].image_url_small}
                alt={configCard.name}
              />
            )}
            <div>
              <div className="card-picker__item-name">{configCard.name}</div>
              <div className="card-picker__item-sub">{configCard.type}</div>
            </div>
          </div>

          <div className="card-picker__config-tabs">
            <button
              className={`card-picker__config-tab${configSource === 'collection' ? ' card-picker__config-tab--active' : ''}`}
              onClick={() => setConfigSource('collection')}
            >
              Collection
            </button>
            <button
              className={`card-picker__config-tab${configSource === 'toGet' ? ' card-picker__config-tab--active' : ''}`}
              onClick={() => setConfigSource('toGet')}
            >
              To Get
            </button>
          </div>

          <div className="card-picker__config-fields">
            <label className="card-picker__config-label">
              Set
              <select
                value={configSetIdx}
                onChange={(e) => setConfigSetIdx(Number(e.target.value))}
              >
                {(configCard.card_sets ?? []).map((s, i) => (
                  <option key={`${s.set_code}-${s.set_rarity_code}`} value={i}>
                    {s.set_name} ({s.set_code}) — {s.set_rarity}
                  </option>
                ))}
                {(configCard.card_sets ?? []).length === 0 && (
                  <option value={0}>No sets available</option>
                )}
              </select>
            </label>

            <label className="card-picker__config-label">
              {configSource === 'collection' ? 'Condition' : 'Min Condition'}
              <select
                value={configCondition}
                onChange={(e) => setConfigCondition(e.target.value as Condition)}
              >
                {CONDITION_ORDER.map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleAssignNew}
              disabled={(configCard.card_sets ?? []).length === 0}
            >
              Add to slot
            </button>
          </div>
        </div>
      )}

      {tab === 'lists' && (
        <div className="card-picker__footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}
