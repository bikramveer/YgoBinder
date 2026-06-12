import React from 'react';

export function ProgressBar({
  value = 0,
  max = 100,
  size = 'md',
  variant = 'accent',
  holo = true,
  label,
  showPct = false,
  className = '',
}: {
  value?: number;
  max?: number;
  size?: 'md' | 'lg';
  variant?: 'accent' | 'success' | 'danger';
  holo?: boolean;
  label?: string;
  showPct?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const rounded = Math.round(pct);
  const fillClasses = [
    'ygo-progress__fill',
    holo && 'ygo-progress__fill--holo',
    variant === 'success' && 'ygo-progress__fill--success',
    variant === 'danger' && 'ygo-progress__fill--danger',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={['ygo-progress-block', className].filter(Boolean).join(' ')}>
      {(label || showPct) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginBottom: '0.35rem',
          }}
        >
          {label ? <span>{label}</span> : <span />}
          {showPct && (
            <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {rounded}%
            </span>
          )}
        </div>
      )}
      <div
        className={['ygo-progress', size === 'lg' && 'ygo-progress--lg'].filter(Boolean).join(' ')}
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={fillClasses} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
