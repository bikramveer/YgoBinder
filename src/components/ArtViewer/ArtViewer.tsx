import { useEffect } from 'react';
import './ArtViewer.css';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ArtViewer({ src, alt, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="art-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Card art viewer">
      <img
        className="art-viewer__img"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
