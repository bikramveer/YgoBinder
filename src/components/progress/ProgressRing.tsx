// import React from 'react';

export function ProgressRing({
  value = 0,
  max = 100,
  size = 52,
  stroke = 4,
  label,
  sublabel,
  showPct = true,
}: {
  value?: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  showPct?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const c = size / 2;

  return (
    <div className="ygo-ring" style={{ width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)', filter: 'drop-shadow(0 0 4px var(--accent-glow))' }}
          />
        )}
        {showPct && (
          <text x={c} y={c + 1} textAnchor="middle" dominantBaseline="middle"
            style={{ fill: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: size * 0.2, fontWeight: 700 }}>
            {label ?? `${Math.round(pct * 100)}%`}
          </text>
        )}
        {sublabel && (
          <text x={c} y={c + size * 0.22} textAnchor="middle"
            style={{ fill: 'var(--text-muted)', fontSize: size * 0.12 }}>
            {sublabel}
          </text>
        )}
      </svg>
    </div>
  );
}
