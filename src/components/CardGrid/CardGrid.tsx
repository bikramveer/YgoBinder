import { useEffect, useRef } from 'react';
import { CardTile } from './CardTile';
import type { YGOCard, ViewMode } from '../../types';
import './CardGrid.css';

interface Props {
  cards: YGOCard[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onCardClick: (card: YGOCard) => void;
  onQuickAdd: (card: YGOCard, e: React.MouseEvent) => void;
}

export function CardGrid({
  cards,
  viewMode,
  onViewModeChange,
  loading,
  error,
  hasMore,
  onLoadMore,
  onCardClick,
  onQuickAdd,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: '200px' },
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div>
      <div className="card-grid-controls">
        <div className="card-grid-controls__toggle">
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => onViewModeChange('grid')}
          >
            Grid
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => onViewModeChange('list')}
          >
            List
          </button>
        </div>
      </div>

      <div className={viewMode === 'grid' ? 'card-grid' : 'card-list'}>
        {cards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            viewMode={viewMode}
            onClick={() => onCardClick(card)}
            onQuickAdd={(e) => onQuickAdd(card, e)}
          />
        ))}

        {error && <div className="card-grid-error">{error}</div>}

        {loading && (
          <div className="card-grid-loading">
            <div className="spinner" />
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="card-grid-sentinel" />
    </div>
  );
}
