import { KONAMI_COVERS } from './binderCovers';
import './BinderCoverPicker.css';

interface Props {
  selected: string | null;
  onChange: (url: string | null) => void;
}

export function BinderCoverPicker({ selected, onChange }: Props) {
  return (
    <div className="cover-picker">
      <button
        className={`cover-picker__none${!selected ? ' cover-picker__none--active' : ''}`}
        onClick={() => onChange(null)}
        type="button"
      >
        No cover — show title
      </button>
      <div className="cover-picker__grid">
        {KONAMI_COVERS.map((cover) => (
          <button
            key={cover.id}
            className={`cover-picker__item${selected === cover.url ? ' cover-picker__item--active' : ''}`}
            onClick={() => onChange(cover.url)}
            type="button"
            title={cover.label}
          >
            <img src={cover.url} alt={cover.label} className="cover-picker__img" />
          </button>
        ))}
      </div>
    </div>
  );
}
