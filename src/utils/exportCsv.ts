import type { CollectionEntry, ToGetEntry } from '../types';

function escape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function download(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCollection(entries: CollectionEntry[]): void {
  const headers = [
    'Card Name', 'Set Name', 'Set Code', 'Rarity',
    'Conditions', 'Total Copies', 'Date Added',
  ];
  const rows = entries.map((e) => {
    const conditions = e.copies.map((c) => `${c.condition}:${c.quantity}`).join(', ');
    const total = e.copies.reduce((s, c) => s + c.quantity, 0);
    return [
      e.cardName, e.setName, e.setCode, e.rarity,
      conditions, String(total), e.dateAdded.slice(0, 10),
    ];
  });
  download('ygobinder-collection.csv', [headers, ...rows]);
}

export function exportToGet(entries: ToGetEntry[], collection: CollectionEntry[]): void {
  const headers = [
    'Card Name', 'Set Name', 'Set Code', 'Rarity',
    'Min Condition', 'Desired', 'Owned', 'Still Needed', 'Date Added',
  ];
  const rows = entries.map((e) => {
    const owned = collection.find((c) => c.id === e.id)
      ?.copies.reduce((s, c) => s + c.quantity, 0) ?? 0;
    const needed = Math.max(0, e.desiredQuantity - owned);
    return [
      e.cardName, e.setName, e.setCode, e.rarity,
      e.minCondition, String(e.desiredQuantity), String(owned), String(needed),
      e.dateAdded.slice(0, 10),
    ];
  });
  download('ygobinder-to-get.csv', [headers, ...rows]);
}
