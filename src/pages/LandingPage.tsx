import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from '../components/AuthModal/AuthModal';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import { HoloRing } from '../components/progress/HoloRing';
import { ProgressBar } from '../components/progress/ProgressBar';
import { Search, Layers, BookOpen, TrendingUp } from 'lucide-react';
import './LandingPage.css';

// ── Logo emblem ───────────────────────────────────────────────────────────────
function LogoEmblem() {
  return (
    <a className="lp-logo" href="#top" aria-label="YgoBindr home">
      <svg className="lp-emblem" width="38" height="33" viewBox="0 0 96 84" fill="none" aria-hidden="true">
        <g transform="rotate(-19,48,66)">
          <rect x="34" y="21" width="28" height="42" rx="3.5" fill="var(--accent)" fillOpacity=".07" stroke="var(--accent)" strokeWidth="2"/>
          <ellipse cx="48" cy="42" rx="6" ry="11" fill="none" stroke="var(--accent)" strokeWidth="2"/>
        </g>
        <g transform="rotate(19,48,66)">
          <rect x="34" y="21" width="28" height="42" rx="3.5" fill="var(--accent)" fillOpacity=".07" stroke="var(--accent)" strokeWidth="2"/>
          <ellipse cx="48" cy="42" rx="6" ry="11" fill="none" stroke="var(--accent)" strokeWidth="2"/>
        </g>
        <g>
          <rect x="34" y="20" width="28" height="42" rx="3.5" fill="var(--accent)" fillOpacity=".07" stroke="var(--accent)" strokeWidth="2"/>
          <ellipse cx="48" cy="41" rx="6" ry="11" fill="none" stroke="var(--accent)" strokeWidth="2"/>
        </g>
        <text x="35" y="60" textAnchor="middle" fontFamily="Orbitron" fontWeight="900" fontSize="46"
          fill="var(--text)" paintOrder="stroke" stroke="var(--bg)" strokeWidth="3.5">Y</text>
        <text x="63" y="48" textAnchor="middle" fontFamily="Orbitron" fontWeight="900" fontSize="46"
          fill="var(--text)" paintOrder="stroke" stroke="var(--bg)" strokeWidth="3.5">B</text>
      </svg>
      <span className="lp-logo__wm">Ygo<span>Bindr</span></span>
    </a>
  );
}

// ── Live dashboard preview ────────────────────────────────────────────────────
const DESIGN_W = 1100;

const DEMO_BINDERS = [
  { name: 'Blue-Eyes Binder',   meta: '4×9 · 3 pages', owned: 67, total: 108 },
  { name: 'Dark Magician Deck', meta: '3×3 · 2 pages', owned: 14, total:  18 },
];

const DEMO_STATS: [string, string][] = [
  ['247',   'Unique Cards'],
  ['1,094', 'Total Copies'],
  ['12',    'On Wishlist'],
  ['$3.2k', 'Est. Value'],
];

const DEMO_RECENT = [46986414, 89631139, 38033121, 55144522, 44095762, 74677422, 24094653, 27169169];

function DashPreview() {
  return (
    <div className="dashpv">
      <div className="dashpv__nav">
        <span className="dashpv__nav-logo">Ygo<span>Bindr</span></span>
        <span className="dashpv__nav-item dashpv__nav-item--active">Dashboard</span>
        <span className="dashpv__nav-item">Search</span>
        <span className="dashpv__nav-item">Binders</span>
        <span className="dashpv__nav-search">&gt; Search cards…</span>
      </div>

      <div className="dashpv__body">
        <h1 className="dashpv__title">Dashboard</h1>

        <div className="dashpv__stats">
          {DEMO_STATS.map(([v, l]) => (
            <div key={l} className="dashpv__stat">
              <span className="dashpv__stat-val">{v}</span>
              <span className="dashpv__stat-lbl">{l}</span>
            </div>
          ))}
        </div>

        <h2 className="dashpv__sec">Binders</h2>
        <div className="dashpv__binder-list">
          {DEMO_BINDERS.map((b) => (
            <div key={b.name} className="dashpv__binder-row">
              <div className="dashpv__binder-info">
                <span className="dashpv__binder-name">{b.name}</span>
                <span className="dashpv__binder-meta">{b.meta}</span>
                <span className="dashpv__binder-owned">{b.owned} owned</span>
              </div>
              <HoloRing value={b.owned} max={b.total} size={64} sublabel={`${b.owned}/${b.total}`} caption="SLOTS"/>
            </div>
          ))}
        </div>

        <h2 className="dashpv__sec">Wishlist</h2>
        <div className="dashpv__wishlist-bar">
          <ProgressBar value={18} max={24} holo showPct label="18 of 24 copies acquired"/>
        </div>

        <h2 className="dashpv__sec">Recently Added</h2>
        <div className="dashpv__recents">
          {DEMO_RECENT.map((id) => (
            <div key={id} className="dashpv__recent-card">
              <img src={`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`} loading="lazy" alt=""/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Count-up stat ─────────────────────────────────────────────────────────────
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();
      const duration = 1400;
      let startTime: number | null = null;
      function step(ts: number) {
        if (!startTime) startTime = ts;
        const p = Math.min(1, (ts - startTime) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.floor(eased * target));
        if (p < 1) requestAnimationFrame(step);
        else setValue(target);
      }
      requestAnimationFrame(step);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
}

// ── Static data ───────────────────────────────────────────────────────────────
const FEATURES = [
  {
    Icon: Search,
    title: 'Search Any Card',
    desc: 'Instant search across the full Yu-Gi-Oh card database with set, rarity, and printing details.',
  },
  {
    Icon: Layers,
    title: 'Track Your Collection',
    desc: 'Log every copy you own with condition and quantity. Know exactly what you have at a glance.',
  },
  {
    Icon: BookOpen,
    title: 'Build Binders',
    desc: 'Organize cards into virtual binders with custom grid layouts and page spreads.',
  },
  {
    Icon: TrendingUp,
    title: 'Price History',
    desc: 'View daily TCGPlayer price snapshots for every card in your collection. Supports multiple currencies.',
  },
];

const STATS = [
  { target: 12000, suffix: '+', label: 'Cards in database' },
  { target: 500,   suffix: '+', label: 'Sets available' },
  { target: 5,     suffix: '',  label: 'Currencies supported' },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate('/dashboard', { replace: true });
  }, [isLoggedIn, isLoading, navigate]);

  useEffect(() => {
    window.HoloText?.decodeAll(document);
  }, []);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => el.style.setProperty('--preview-scale', String(el.clientWidth / DESIGN_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (isLoading || isLoggedIn) return null;

  return (
    <div className="landing">

      {/* ── Nav ── */}
      <header className="landing__header">
        <LogoEmblem/>
        <div className="landing__header-actions">
          <ThemeToggle/>
          <button className="btn btn-primary landing__signin-btn" onClick={() => setAuthOpen(true)}>
            Sign in
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero holo-grid holo-scanlines">
        <h1 className="lp-title">
          <span data-decode data-caret>Your Yu-Gi-Oh</span>
          <span className="lp-title-accent holo-glow-text">collection, organized.</span>
        </h1>
        <p className="lp-subtitle">
          Search cards, track your collection, build virtual binders, and follow market prices — all in one place.
        </p>
        <div className="lp-cta-group">
          <button className="btn btn-primary lp-cta-btn" onClick={() => setAuthOpen(true)}>
            Start your collection →
          </button>
          <button className="btn btn-ghost lp-cta-btn" onClick={() => navigate('/search')}>
            Try it first
          </button>
        </div>
      </section>

      {/* ── Stat ticker ── */}
      <div className="lp-ticker">
        {STATS.map(({ target, suffix, label }) => (
          <div key={label} className="lp-ticker__stat">
            <span className="lp-ticker__num"><CountUp target={target} suffix={suffix}/></span>
            <span className="lp-ticker__label">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Split preview ── */}
      <section className="lp-preview-section">
        <div className="lp-preview-wrap">
          <div className="lp-preview" ref={previewRef}>
            <div className="lp-preview__layer lp-preview__layer--light" data-theme="light">
              <div className="dashpv-outer"><div className="dashpv-scale"><DashPreview/></div></div>
            </div>
            <div className="lp-preview__layer lp-preview__layer--dark" data-theme="dark">
              <div className="dashpv-outer"><div className="dashpv-scale"><DashPreview/></div></div>
            </div>
            <span className="lp-preview__tag lp-preview__tag--light">Light · KaibaCorp Terminal</span>
            <span className="lp-preview__tag lp-preview__tag--dark">Dark · Shadow Hologram</span>
            <div className="lp-preview__seam" aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="57" y1="0" x2="43" y2="100"
                  stroke="var(--accent-bright)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
              </svg>
            </div>
            <div className="lp-preview__dot" aria-hidden="true"/>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features">
        <h2 className="lp-section-title" data-decode>Everything you need</h2>
        <div className="lp-grid">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="lp-feature holo-frame">
              <div className="lp-feature__icon"><Icon size={22} strokeWidth={1.5}/></div>
              <h3 className="lp-feature__title">{title}</h3>
              <p className="lp-feature__desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="lp-band holo-grid holo-grid--floor">
        <h2 className="lp-band__title" data-decode>Ready to organize your collection?</h2>
        <p className="lp-band__sub">Free to use. No credit card required.</p>
        <div className="lp-cta-group">
          <button className="btn btn-primary lp-cta-btn" onClick={() => setAuthOpen(true)}>
            Create your account →
          </button>
          <button className="btn btn-ghost lp-cta-btn" onClick={() => navigate('/search')}>
            Browse cards first
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing__footer">
        <LogoEmblem/>
        <span>© {new Date().getFullYear()} YgoBindr</span>
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)}/>}
    </div>
  );
}
