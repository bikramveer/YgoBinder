import React from 'react';

export function HoloRing({
  value = 0,
  max = 100,
  size = 200,
  label,
  sublabel,
  caption,
  spinning = true,
  className = '',
  style,
}: {
  value?: number;
  max?: number;
  size?: number;
  label?: string;
  sublabel?: string;
  caption?: string;
  spinning?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const rounded = Math.round(pct * 100);

  const C = 100;
  const rProg = 60;
  const circ = 2 * Math.PI * rProg;
  const dash = circ * pct;
  const headAngle = (-90 + pct * 360) * (Math.PI / 180);
  const headX = C + rProg * Math.cos(headAngle);
  const headY = C + rProg * Math.sin(headAngle);

  const ticks: React.ReactNode[] = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const major = i % 5 === 0;
    const a = (i / N) * 360 * (Math.PI / 180);
    const r1 = 90;
    const r2 = major ? 80 : 84;
    ticks.push(
      <line
        key={i}
        x1={C + r1 * Math.cos(a)} y1={C + r1 * Math.sin(a)}
        x2={C + r2 * Math.cos(a)} y2={C + r2 * Math.sin(a)}
        stroke="var(--accent)" strokeWidth={major ? 1.6 : 0.8}
        opacity={major ? 0.7 : 0.35}
      />
    );
  }

  const bracket = (rad: number, span: number, rot: number) => {
    const start = rot * (Math.PI / 180);
    const end = (rot + span) * (Math.PI / 180);
    const large = span > 180 ? 1 : 0;
    return `M ${C + rad * Math.cos(start)} ${C + rad * Math.sin(start)} ` +
      `A ${rad} ${rad} 0 ${large} 1 ${C + rad * Math.cos(end)} ${C + rad * Math.sin(end)}`;
  };

  return (
    <div className={['holo-ring', className].filter(Boolean).join(' ')} style={{ width: size, height: size, ...style }}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${rounded}% complete`}>
        <defs>
          <radialGradient id="hr-core" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.30" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--bg)" stopOpacity="0.0" />
          </radialGradient>
          <filter id="hr-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle className="holo-ring__core" cx={C} cy={C} r={52} fill="url(#hr-core)" />
        <circle cx={C} cy={C} r={50} fill="none" stroke="var(--accent)" strokeWidth="0.6" opacity="0.4" />

        <g className={spinning ? 'holo-ring__spin-cw' : ''}>
          <path d={bracket(92, 70, 200)} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" opacity="0.85" filter="url(#hr-glow)" />
          <path d={bracket(92, 40, 20)} fill="none" stroke="var(--accent-bright)" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          <path d={bracket(92, 16, 120)} fill="none" stroke="var(--accent-bright)" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </g>

        <g className={spinning ? 'holo-ring__ticks' : ''}>{ticks}</g>

        <g className={spinning ? 'holo-ring__spin-ccw' : ''}>
          <circle cx={C} cy={C} r={72} fill="none" stroke="var(--accent)" strokeWidth="2"
            strokeDasharray="2 7" opacity="0.55" strokeLinecap="round" />
        </g>

        <circle cx={C} cy={C} r={rProg} fill="none" stroke="var(--accent)" strokeWidth="3" opacity="0.18" />
        <circle
          cx={C} cy={C} r={rProg} fill="none" stroke="var(--accent-bright)" strokeWidth="3.5"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${C} ${C})`} filter="url(#hr-glow)"
          style={{ transition: 'stroke-dasharray var(--dur-slower) var(--ease-out)' }}
        />
        {pct > 0.003 && (
          <circle className={spinning ? 'holo-ring__head' : ''} cx={headX} cy={headY} r={3.6}
            fill="#fff" filter="url(#hr-glow)" />
        )}

        <text
          x={C}
          y={sublabel && caption ? C - 12 : caption ? C - 4 : sublabel ? C - 2 : C + 2}
          textAnchor="middle" dominantBaseline="middle"
          style={{ fill: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '0.02em' }}>
          {label != null ? label : `${rounded}%`}
        </text>
        {sublabel && (
          <text x={C} y={sublabel && caption ? C + 15 : C + 18} textAnchor="middle"
            style={{ fill: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em' }}>
            {sublabel}
          </text>
        )}
        {caption && (
          <text x={C} y={sublabel ? C + 30 : C + 16} textAnchor="middle"
            style={{ fill: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            {caption}
          </text>
        )}
      </svg>
    </div>
  );
}
