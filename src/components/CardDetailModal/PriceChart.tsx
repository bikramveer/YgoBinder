import { useState } from 'react';
import type { PricePoint } from '../../services/api';
import type { CurrencyCode } from '../../types';
import { SUPPORTED_CURRENCIES } from '../../types';
import './PriceChart.css';

interface Props {
  history: PricePoint[];
  currency: CurrencyCode;
  loading: boolean;
}

const VB_W = 500;
const VB_H = 120;
const PAD = { top: 16, right: 12, bottom: 24, left: 56 };
const CW = VB_W - PAD.left - PAD.right; // chart width
const CH = VB_H - PAD.top - PAD.bottom; // chart height

function chartFormat(value: number, currency: CurrencyCode): string {
  const sym = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$';
  if (currency === 'JPY') return `${sym}${Math.round(value)}`;
  return `${sym}${value.toFixed(2)}`;
}

export function PriceChart({ history, currency, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="price-chart price-chart--empty">
        <div className="spinner" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="price-chart price-chart--empty">
        No price history yet — check back after the daily sync runs.
      </div>
    );
  }

  // Convert each point using its historically accurate rate for that day
  const converted = history.map((p) => {
    const rate = currency === 'USD' ? 1 : (p.rates[currency] ?? 1);
    return p.price_usd * rate;
  });

  const minP = Math.min(...converted);
  const maxP = Math.max(...converted);
  const range = maxP - minP || minP * 0.1 || 1;

  const toX = (i: number) =>
    PAD.left + (history.length === 1 ? CW / 2 : (CW * i) / (history.length - 1));

  const toY = (price: number) =>
    PAD.top + CH - ((price - minP) / range) * CH;

  const polyPoints = converted.map((p, i) => `${toX(i)},${toY(p)}`).join(' ');

  const firstDate = history[0].date;
  const lastDate = history[history.length - 1].date;

  const midP = (minP + maxP) / 2;
  const yLabels = [
    { value: maxP, y: toY(maxP) },
    { value: midP, y: toY(midP) },
    { value: minP, y: toY(minP) },
  ];

  // Tooltip positioning — keep it inside the viewBox
  const tooltipForIdx = (i: number) => {
    const x = toX(i);
    const y = toY(converted[i]);
    const tw = 90;
    const th = 22;
    const tx = Math.max(PAD.left, Math.min(x - tw / 2, VB_W - PAD.right - tw));
    const ty = y - th - 8 < PAD.top ? y + 8 : y - th - 8;
    return { tx, ty, tw, th };
  };

  return (
    <div className="price-chart">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        className="price-chart__svg"
        aria-label="Price history chart"
      >
        {/* Y-axis grid + labels */}
        {yLabels.map(({ value, y }) => (
          <g key={value}>
            <line
              x1={PAD.left} y1={y}
              x2={VB_W - PAD.right} y2={y}
              stroke="var(--border)" strokeWidth="0.75" strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 4} y={y + 3.5}
              textAnchor="end" fontSize="9" fill="var(--text-muted)"
            >
              {chartFormat(value, currency)}
            </text>
          </g>
        ))}

        {/* Price line */}
        {history.length > 1 && (
          <polyline
            points={polyPoints}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {/* Area fill under the line */}
        {history.length > 1 && (
          <polyline
            points={`${PAD.left},${toY(minP) + CH * 0} ${polyPoints} ${toX(history.length - 1)},${PAD.top + CH} ${PAD.left},${PAD.top + CH}`}
            fill="var(--accent)"
            fillOpacity="0.08"
            stroke="none"
          />
        )}

        {/* Data point circles */}
        {converted.map((price, i) => {
          const hovered = hoveredIdx === i;
          return (
            <circle
              key={i}
              cx={toX(i)}
              cy={toY(price)}
              r={hovered ? 5 : 3}
              fill={hovered ? 'var(--accent)' : 'var(--surface)'}
              stroke="var(--accent)"
              strokeWidth="2"
              className="price-chart__dot"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}

        {/* Hover tooltip */}
        {hoveredIdx !== null && (() => {
          const { tx, ty, tw, th } = tooltipForIdx(hoveredIdx);
          return (
            <g pointerEvents="none">
              <rect
                x={tx} y={ty} width={tw} height={th} rx="3"
                fill="var(--surface)" stroke="var(--accent)" strokeWidth="0.75"
              />
              <text
                x={tx + tw / 2} y={ty + th / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill="var(--text)"
              >
                {history[hoveredIdx].date} · {chartFormat(converted[hoveredIdx], currency)}
              </text>
            </g>
          );
        })()}

        {/* X-axis date labels */}
        <text
          x={PAD.left} y={VB_H - 4}
          fontSize="8" fill="var(--text-muted)"
        >
          {firstDate}
        </text>
        {history.length > 1 && (
          <text
            x={VB_W - PAD.right} y={VB_H - 4}
            textAnchor="end" fontSize="8" fill="var(--text-muted)"
          >
            {lastDate}
          </text>
        )}
      </svg>
    </div>
  );
}
