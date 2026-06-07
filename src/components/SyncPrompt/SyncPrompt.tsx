import { useState } from 'react';
import { useCollection } from '../../context/CollectionContext';
import './SyncPrompt.css';

export function SyncPrompt() {
  const { showSyncPrompt, importLocalData, dismissSyncPrompt } = useCollection();
  const [loading, setLoading] = useState(false);

  if (!showSyncPrompt) return null;

  async function handleImport() {
    setLoading(true);
    try {
      await importLocalData();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sync-prompt">
      <div className="sync-prompt__content">
        <div className="sync-prompt__text">
          <strong>You have local data saved as a guest.</strong>
          {' '}Import it into your account?
        </div>
        <div className="sync-prompt__actions">
          <button
            className="btn btn-primary sync-prompt__import"
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
          <button
            className="btn btn-ghost sync-prompt__dismiss"
            onClick={dismissSyncPrompt}
            disabled={loading}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
