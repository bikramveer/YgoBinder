import { useState } from 'react';
import './BinderSizePicker.css';

const MAX = 4;

interface Props {
  cols: number;
  rows: number;
  onChange: (cols: number, rows: number) => void;
}

export function BinderSizePicker({ cols, rows, onChange }: Props) {
  const [hoverCol, setHoverCol] = useState(0);
  const [hoverRow, setHoverRow] = useState(0);
  const isHovering = hoverCol > 0 && hoverRow > 0;

  const displayCol = isHovering ? hoverCol : cols;
  const displayRow = isHovering ? hoverRow : rows;

  return (
    <div className="binder-size-picker">
      <div
        className="binder-size-picker__grid"
        onMouseLeave={() => { setHoverCol(0); setHoverRow(0); }}
      >
        {Array.from({ length: MAX }, (_, ri) =>
          Array.from({ length: MAX }, (_, ci) => {
            const r = ri + 1;
            const c = ci + 1;
            const isActive = r <= displayRow && c <= displayCol;
            return (
              <div
                key={`${r}-${c}`}
                className={`binder-size-picker__cell${isActive ? ' binder-size-picker__cell--active' : ''}`}
                onMouseEnter={() => { setHoverCol(c); setHoverRow(r); }}
                onClick={() => onChange(c, r)}
              />
            );
          }),
        )}
      </div>
      <div className="binder-size-picker__label">
        {displayCol} × {displayRow}
        <span className="binder-size-picker__sublabel">
          {' '}({displayCol * displayRow} slots per page)
        </span>
      </div>
    </div>
  );
}
