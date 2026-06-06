import { useCollection } from '../context/CollectionContext';
import { Link } from 'react-router-dom';
import type { CollectionEntry } from '../types';

function totalCopies(entry: CollectionEntry): number {
  return entry.copies.reduce((s, c) => s + c.quantity, 0);
}

export function DashboardPage() {
  const { state } = useCollection();

  const totalUnique = state.collection.length;
  const totalCopiesCount = state.collection.reduce((s, e) => s + totalCopies(e), 0);
  const toGetCount = state.toGet.length;

  const recent = [...state.collection]
    .sort((a, b) => (a.dateAdded > b.dateAdded ? -1 : 1))
    .slice(0, 8);

  return (
    <main className="page">
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '1.25rem' }}>
        YgoBinder
      </h1>

      {/* Stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        {[
          { label: 'Unique Cards', value: totalUnique },
          { label: 'Total Copies', value: totalCopiesCount },
          { label: 'On To Get List', value: toGetCount },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.85rem 1rem',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link to="/search" className="btn btn-primary">Search Cards</Link>
        <Link to="/collection" className="btn btn-ghost">View Collection</Link>
        <Link to="/to-get" className="btn btn-ghost">View To Get</Link>
      </div>

      {/* Recently added */}
      {recent.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            Recently Added
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
            gap: '0.5rem',
          }}>
            {recent.map((entry) => (
              <div
                key={entry.id}
                title={`${entry.cardName} (${entry.setCode})`}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                {entry.cardImageUrl ? (
                  <img
                    src={entry.cardImageUrl}
                    alt={entry.cardName}
                    style={{ width: '100%', aspectRatio: '421/614', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ aspectRatio: '421/614', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    No img
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {totalUnique === 0 && (
        <div className="empty-state">
          <strong>Your collection is empty</strong>
          <p>Head to Search to find your first card.</p>
        </div>
      )}
    </main>
  );
}
