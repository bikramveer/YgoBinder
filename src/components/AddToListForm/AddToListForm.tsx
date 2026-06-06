import { useState } from 'react';
import type { YGOCard, YGOCardSet, Condition } from '../../types';
import { CONDITION_ORDER, CONDITION_LABELS } from '../../types';
import './AddToListForm.css';

interface Props {
  card: YGOCard;
  preselectedSet?: YGOCardSet;
  mode: 'collection' | 'toget';
  onSubmit: (set: YGOCardSet, condition: Condition, quantity: number) => void;
  onCancel: () => void;
}

export function AddToListForm({ card, preselectedSet, mode, onSubmit, onCancel }: Props) {
  const sets = card.card_sets ?? [];
  const [selectedSetCode, setSelectedSetCode] = useState(
    preselectedSet?.set_code ?? sets[0]?.set_code ?? '',
  );
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);

  const selectedSet = sets.find((s) => s.set_code === selectedSetCode) ?? sets[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSet) return;
    onSubmit(selectedSet, condition, quantity);
  };

  return (
    <div className="add-form">
      <div className="add-form__title">
        {mode === 'collection' ? 'Add to Collection' : 'Add to To Get'}
      </div>
      <div className="add-form__subtitle">{card.name}</div>

      <form onSubmit={handleSubmit}>
        {sets.length > 0 && (
          <div className="add-form__field">
            <label className="add-form__label">Set printing</label>
            <select
              value={selectedSetCode}
              onChange={(e) => setSelectedSetCode(e.target.value)}
            >
              {sets.map((s) => (
                <option key={s.set_code} value={s.set_code}>
                  {s.set_name} ({s.set_code}) — {s.set_rarity}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="add-form__field">
          <label className="add-form__label">
            {mode === 'collection' ? 'Condition' : 'Minimum acceptable condition'}
          </label>
          <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
            {CONDITION_ORDER.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]} ({c})</option>
            ))}
          </select>
        </div>

        <div className="add-form__field">
          <label className="add-form__label">
            {mode === 'collection' ? 'Quantity' : 'Desired quantity'}
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>

        <div className="add-form__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!selectedSet}>
            {mode === 'collection' ? 'Add to Collection' : 'Add to To Get'}
          </button>
        </div>
      </form>
    </div>
  );
}
