import { useCollection } from '../../context/CollectionContext';
import { getCardTypeColor, getCardTypeLabel } from '../../utils/cardTypeColors';
import type { YGOCard, ViewMode } from '../../types';
import './CardTile.css';

interface Props {
  card: YGOCard;
  viewMode: ViewMode;
  onClick: () => void;
  onQuickAdd: (e: React.MouseEvent) => void;
}

export function CardTile({ card, viewMode, onClick, onQuickAdd }: Props) {
  const { state } = useCollection();
  const inCollection = state.collection.some((e) => e.cardId === card.id);
  const inToGet = state.toGet.some((e) => e.cardId === card.id);

  const typeColor = getCardTypeColor(card.frameType);
  const typeLabel = getCardTypeLabel(card.type, card.frameType);
  const imageUrl = card.card_images[0]?.image_url_small ?? '';

  if (viewMode === 'list') {
    return (
      <div className="card-list-row" onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}>
        {imageUrl
          ? <img className="card-list-row__thumb" src={imageUrl} alt={card.name} loading="lazy" />
          : <div className="card-list-row__thumb" style={{ background: 'var(--surface-2)' }} />
        }
        <div className="card-list-row__info">
          <div className="card-list-row__name">{card.name}</div>
          <div className="card-list-row__meta">
            <span
              className="badge"
              style={{ background: typeColor.bg, color: typeColor.text }}
            >
              {typeLabel}
            </span>
            <div className="card-list-row__badges">
              {inCollection && <span className="card-tile__badge card-tile__badge--collection">Owned</span>}
              {inToGet && <span className="card-tile__badge card-tile__badge--toget">Want</span>}
            </div>
          </div>
        </div>
        <button className="card-list-row__quick-add" onClick={onQuickAdd} title="Quick add" aria-label="Quick add">
          +
        </button>
      </div>
    );
  }

  return (
    <div className="card-tile" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="card-tile__image-wrap">
        {imageUrl
          ? <img src={imageUrl} alt={card.name} loading="lazy" />
          : <div className="card-tile__image-placeholder">No image</div>
        }
        <div className="card-tile__badges">
          {inCollection && <span className="card-tile__badge card-tile__badge--collection">Owned</span>}
          {inToGet && <span className="card-tile__badge card-tile__badge--toget">Want</span>}
        </div>
        <button
          className="card-tile__quick-add"
          onClick={onQuickAdd}
          title="Quick add"
          aria-label="Quick add"
        >
          +
        </button>
      </div>
      <div className="card-tile__info">
        <div className="card-tile__name">{card.name}</div>
        <span
          className="card-tile__type-badge"
          style={{ background: typeColor.bg, color: typeColor.text }}
        >
          {typeLabel}
        </span>
      </div>
    </div>
  );
}
