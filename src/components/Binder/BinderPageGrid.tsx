import { BinderSlot } from './BinderSlot';
import type { ResolvedSlotData } from './BinderSlot';
import './BinderPageGrid.css';

interface Props {
  cols: number;
  rows: number;
  resolvedSlots: (ResolvedSlotData | null)[];
  dragSourceSlot: number | null;
  dragOverSlot: number | null;
  onSlotClick: (slotIndex: number) => void;
  onDragStart: (e: React.DragEvent, slotIndex: number) => void;
  onDragOver: (e: React.DragEvent, slotIndex: number) => void;
  onDrop: (e: React.DragEvent, slotIndex: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export function BinderPageGrid({
  cols,
  rows,
  resolvedSlots,
  dragSourceSlot,
  dragOverSlot,
  onSlotClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragEnd,
}: Props) {
  const slotCount = cols * rows;
  const maxWidth = Math.min(480, cols * 130 + (cols - 1) * 8 + 32);

  return (
    <div
      className="binder-page-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        maxWidth: `${maxWidth}px`,
      }}
    >
      {Array.from({ length: slotCount }, (_, i) => (
        <BinderSlot
          key={i}
          slotIndex={i}
          data={resolvedSlots[i] ?? null}
          isDragOver={dragOverSlot === i}
          isDragging={dragSourceSlot === i}
          onClick={() => onSlotClick(i)}
          onDragStart={(e) => onDragStart(e, i)}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={(e) => onDrop(e, i)}
          onDragLeave={onDragLeave}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}
