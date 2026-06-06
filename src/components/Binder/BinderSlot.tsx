import type { Condition } from '../../types';
import { YGO_CARD_BACK_URL } from '../../types';
import './BinderSlot.css';

export interface ResolvedSlotData {
  entryId: string;
  source: 'collection' | 'toGet';
  cardName: string;
  cardImageUrl: string;
  condition?: Condition;
}

interface Props {
  slotIndex: number;
  data: ResolvedSlotData | null;
  isDragOver: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export function BinderSlot({
  data,
  isDragOver,
  isDragging,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragEnd,
}: Props) {
  const classes = [
    'binder-slot',
    isDragOver ? 'binder-slot--drag-over' : '',
    isDragging ? 'binder-slot--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      draggable={data != null}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
    >
      {data ? (
        <>
          <img
            className={`binder-slot__img${data.source === 'toGet' ? ' binder-slot__img--toget' : ''}`}
            src={data.cardImageUrl}
            alt={data.cardName}
          />
          {data.source === 'toGet' && (
            <span className="binder-slot__badge binder-slot__badge--toget">Want</span>
          )}
          {data.source === 'collection' && data.condition && (
            <span className="binder-slot__badge binder-slot__badge--condition">{data.condition}</span>
          )}
        </>
      ) : (
        <img
          className="binder-slot__back"
          src={YGO_CARD_BACK_URL}
          alt="Empty slot"
        />
      )}
    </div>
  );
}
