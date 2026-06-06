// Maps YGOPRODeck frameType/type strings to official card frame colors

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  normal:        { bg: '#d4a017', text: '#1a1a0e' },
  effect:        { bg: '#f97600', text: '#fff' },
  ritual:        { bg: '#6b9cff', text: '#fff' },
  fusion:        { bg: '#9c5ac5', text: '#fff' },
  synchro:       { bg: '#e0e0e0', text: '#111' },
  xyz:           { bg: '#4a4a4a', text: '#fff' },
  link:          { bg: '#3a6fd8', text: '#fff' },
  pendulum:      { bg: '#4cbc8a', text: '#fff' },
  spell:         { bg: '#1d9e74', text: '#fff' },
  trap:          { bg: '#bc5a84', text: '#fff' },
  token:         { bg: '#8a9ba8', text: '#fff' },
  skill:         { bg: '#4a90d9', text: '#fff' },
};

export function getCardTypeColor(frameType: string): { bg: string; text: string } {
  const key = frameType.toLowerCase().replace(/[^a-z]/g, '');
  // pendulum variants: "normal_pendulum", "effect_pendulum", etc.
  if (key.includes('pendulum')) return TYPE_COLORS['pendulum'];
  return TYPE_COLORS[key] ?? { bg: '#555', text: '#fff' };
}

export function getCardTypeLabel(type: string, frameType: string): string {
  const ft = frameType.toLowerCase();
  if (ft.includes('spell')) return 'Spell';
  if (ft.includes('trap')) return 'Trap';
  if (ft.includes('token')) return 'Token';
  // For monsters, use the frameType for display
  const labels: Record<string, string> = {
    normal: 'Normal',
    effect: 'Effect',
    ritual: 'Ritual',
    fusion: 'Fusion',
    synchro: 'Synchro',
    xyz: 'XYZ',
    link: 'Link',
    pendulum: 'Pendulum',
    normal_pendulum: 'Pendulum',
    effect_pendulum: 'Pendulum',
  };
  return labels[ft] ?? type.split(' ')[0];
}
