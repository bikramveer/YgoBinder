import { useState, useEffect, useRef } from 'react';
import { Loader } from 'lucide-react';
import type { YGOCard, YGOCardSet, Condition } from '../../types';
import { CONDITION_ORDER, CONDITION_LABELS } from '../../types';
import { getYugipediaData, yugipediaImageUrl } from '../../services/yugipediaArtwork';
import type { YugipediaData } from '../../services/yugipediaArtwork';
import { ArtViewer } from '../ArtViewer/ArtViewer';
import './AddToListForm.css';

interface Props {
  card: YGOCard;
  preselectedSet?: YGOCardSet;
  mode: 'collection' | 'wishlist';
  onSubmit: (set: YGOCardSet, condition: Condition, quantity: number, imageUrl: string) => void;
  onCancel: () => void;
}

export function AddToListForm({ card, preselectedSet, mode, onSubmit, onCancel }: Props) {
  const sets = card.card_sets ?? [];
  const [selectedSetCode, setSelectedSetCode] = useState(
    preselectedSet?.set_code ?? sets[0]?.set_code ?? '',
  );
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const [artworkData, setArtworkData] = useState<YugipediaData | null>(null);
  const [artworkLoading, setArtworkLoading] = useState(true);
  const [artViewerSrc, setArtViewerSrc] = useState<string | null>(null);
  const fetchRef = useRef<string | null>(null);

  useEffect(() => {
    const name = card.name;
    fetchRef.current = name;
    setArtworkLoading(true);
    getYugipediaData(name)
      .then((data) => {
        if (fetchRef.current !== name) return;
        setArtworkData(data);
        setArtworkLoading(false);
      })
      .catch(() => {
        if (fetchRef.current !== name) return;
        setArtworkLoading(false);
      });
  }, [card.name]);

  const selectedSet = sets.find((s) => s.set_code === selectedSetCode) ?? sets[0];

  const resolveImage = (): string => {
    const fallback = card.card_images[0]?.image_url_small ?? '';
    if (!artworkData || !selectedSet) return fallback;
    const setPrefix = selectedSet.set_code.split('-')[0];
    const artIdx = artworkData.artMap.get(setPrefix) ?? 0;
    return yugipediaImageUrl(artworkData.galleryMap, setPrefix, selectedSet.set_rarity, artIdx) ?? fallback;
  };

  const heroImageUrl = resolveImage();
  const fallbackImageUrl = card.card_images[0]?.image_url_small ?? '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSet) return;
    onSubmit(selectedSet, condition, quantity, resolveImage());
  };

  return (
    <>
    <div className="add-form">
      <div className="add-form__hero">
        <div className="add-form__hero-img-wrap">
          <img
            className={`add-form__hero-img${artworkLoading ? ' add-form__hero-img--loading' : ''}`}
            src={heroImageUrl || fallbackImageUrl}
            alt={card.name}
            onClick={() => { if (!artworkLoading && (heroImageUrl || fallbackImageUrl)) setArtViewerSrc(heroImageUrl || fallbackImageUrl); }}
            style={{ cursor: artworkLoading ? 'default' : 'zoom-in' }}
          />
          {artworkLoading && (
            <div className="add-form__hero-spinner">
              <Loader size={14} className="spin" />
            </div>
          )}
        </div>
        <div className="add-form__hero-info">
          <div className="add-form__title">
            {mode === 'collection' ? 'Add to Collection' : 'Add to Wishlist'}
          </div>
          <div className="add-form__subtitle">{card.name}</div>
          {selectedSet && (
            <div className="add-form__hero-rarity">{selectedSet.set_rarity}</div>
          )}
        </div>
      </div>

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
            {mode === 'collection' ? 'Add to Collection' : 'Add to Wishlist'}
          </button>
        </div>
      </form>
    </div>
    {artViewerSrc && (
      <ArtViewer src={artViewerSrc} alt={card.name} onClose={() => setArtViewerSrc(null)} />
    )}
    </>
  );
}
