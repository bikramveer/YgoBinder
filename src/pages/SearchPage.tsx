import { useState } from 'react';
import { CardGrid } from '../components/CardGrid/CardGrid';
import { CardDetailModal } from '../components/CardDetailModal/CardDetailModal';
import { AddToListForm } from '../components/AddToListForm/AddToListForm';
import { useCardSearch } from '../hooks/useCardSearch';
import { useCollection } from '../context/CollectionContext';
import type { YGOCard, YGOCardSet, ViewMode, Condition } from '../types';
import { CONDITION_ORDER } from '../types';
import './SearchPage.css';

const CARD_TYPES = [
  { value: '', label: 'All types' },
  { value: 'Effect Monster', label: 'Effect Monster' },
  { value: 'Normal Monster', label: 'Normal Monster' },
  { value: 'Fusion Monster', label: 'Fusion Monster' },
  { value: 'Synchro Monster', label: 'Synchro Monster' },
  { value: 'XYZ Monster', label: 'XYZ Monster' },
  { value: 'Link Monster', label: 'Link Monster' },
  { value: 'Ritual Monster', label: 'Ritual Monster' },
  { value: 'Spell Card', label: 'Spell Card' },
  { value: 'Trap Card', label: 'Trap Card' },
];

const RARITIES = [
  { value: '', label: 'All rarities' },
  { value: 'Common', label: 'Common' },
  { value: 'Rare', label: 'Rare' },
  { value: 'Super Rare', label: 'Super Rare' },
  { value: 'Ultra Rare', label: 'Ultra Rare' },
  { value: 'Secret Rare', label: 'Secret Rare' },
  { value: 'Ultimate Rare', label: 'Ultimate Rare' },
  { value: 'Ghost Rare', label: 'Ghost Rare' },
  { value: 'Starlight Rare', label: 'Starlight Rare' },
  { value: "Collector's Rare", label: "Collector's Rare" },
  { value: 'Prismatic Secret Rare', label: 'Prismatic Secret Rare' },
];

type QuickAddModal = { card: YGOCard; set?: YGOCardSet; mode: 'collection' | 'wishlist' } | null;

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [cardType, setCardType] = useState('');
  const [rarity, setRarity] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [detailCard, setDetailCard] = useState<YGOCard | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddModal>(null);

  const { cards, loading, error, hasMore, loadMore } = useCardSearch(query, cardType, rarity);
  const { dispatch } = useCollection();

  const handleQuickAdd = (card: YGOCard, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickAdd({ card, mode: 'collection' });
  };

  const handleQuickAddSubmit = (set: YGOCardSet, condition: Condition, quantity: number, imageUrl: string) => {
    if (!quickAdd) return;
    const { card, mode } = quickAdd;
    const entryId = `${card.id}-${set.set_code}-${set.set_rarity_code}`;
    if (mode === 'collection') {
      dispatch({
        type: 'ADD_TO_COLLECTION',
        entry: {
          id: entryId,
          cardId: card.id,
          cardName: card.name,
          cardImageUrl: imageUrl,
          setName: set.set_name,
          setCode: set.set_code,
          rarity: set.set_rarity,
          copies: [{ condition, quantity }].sort(
            (a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition),
          ),
          dateAdded: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_TO_WISHLIST',
        entry: {
          id: entryId,
          cardId: card.id,
          cardName: card.name,
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
    setQuickAdd(null);
  };

  return (
    <main className="page">
      <h1 className="page-title" data-decode data-caret>Search & Browse</h1>
      <div className="search-page__bar">
        <div className="holo-input search-page__input-wrap" data-prompt>
          <span className="holo-input__prompt" aria-hidden="true">&gt;</span>
          <input
            className="search-page__input"
            type="search"
            placeholder="Search for a card…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <span className="holo-input__beam" aria-hidden="true"></span>
        </div>
        <div className="search-page__filters">
          <select value={cardType} onChange={(e) => setCardType(e.target.value)}>
            {CARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            {RARITIES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!loading && !query && cards.length > 0 && (
        <div className="search-page__label">Popular cards</div>
      )}

      {!loading && !error && cards.length === 0 && query && (
        <div className="search-page__prompt">No cards found.</div>
      )}

      <CardGrid
        cards={cards}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        loading={loading}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onCardClick={(card) => setDetailCard(card)}
        onQuickAdd={handleQuickAdd}
      />

      {/* Card detail modal — handles add form internally */}
      {detailCard && (
        <CardDetailModal
          cardId={detailCard.id}
          initialCard={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}

      {/* Quick-add modal (from tile + button — no set preselected) */}
      {quickAdd && (
        <div className="modal-backdrop" onClick={() => setQuickAdd(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <AddToListForm
              card={quickAdd.card}
              preselectedSet={quickAdd.set}
              mode={quickAdd.mode}
              onSubmit={handleQuickAddSubmit}
              onCancel={() => setQuickAdd(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
