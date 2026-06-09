import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from '../components/AuthModal/AuthModal';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import './LandingPage.css';

const FEATURES = [
  {
    icon: '🔍',
    title: 'Search Any Card',
    desc: 'Instant search across the full Yu-Gi-Oh card database with set, rarity, and printing details.',
  },
  {
    icon: '📦',
    title: 'Track Your Collection',
    desc: 'Log every copy you own with condition and quantity. Know exactly what you have at a glance.',
  },
  {
    icon: '📖',
    title: 'Build Binders',
    desc: 'Organize cards into virtual binders with custom grid layouts, drag-and-drop, and page spreads.',
  },
  {
    icon: '💰',
    title: 'Price History',
    desc: 'View daily TCGPlayer price snapshots for every card in your collection. Supports multiple currencies.',
  },
];

export function LandingPage() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);

  const enterApp = () => navigate('/search');

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading || isLoggedIn) return null;

  return (
    <div className="landing">
      {/* ── Header ── */}
      <header className="landing__header">
        <span className="landing__logo">YgoBindr</span>
        <div className="landing__header-actions">
          <ThemeToggle />
          <button className="btn btn-primary landing__signin-btn" onClick={() => setAuthOpen(true)}>
            Sign in
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing__hero">
        <h1 className="landing__title">
          Your Yu-Gi-Oh collection,<br />
          <span className="landing__title-accent">organized at last.</span>
        </h1>
        <p className="landing__subtitle">
          Search cards, track your collection, build virtual binders, and follow market prices — all in one place.
        </p>
        <div className="landing__cta">
          <button className="btn btn-primary landing__cta-btn" onClick={enterApp}>
            Start your collection →
          </button>
        </div>
      </section>

      {/* ── Screenshot placeholder ── */}
      <section className="landing__preview">
        <div className="landing__screenshot-wrap">
          {/* Replace src with an actual screenshot when design is final */}
          <div className="landing__screenshot-placeholder">
            <span>App preview</span>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing__features">
        <h2 className="landing__section-title">Everything you need</h2>
        <div className="landing__feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing__feature-card">
              <span className="landing__feature-icon">{f.icon}</span>
              <h3 className="landing__feature-title">{f.title}</h3>
              <p className="landing__feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing__footer">
        <span>© {new Date().getFullYear()} YgoBindr</span>
        {/* <a
          href="https://github.com/bikramveer/YgoBindr"
          target="_blank"
          rel="noopener noreferrer"
          className="landing__footer-link"
        >
          GitHub
        </a> */}
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
