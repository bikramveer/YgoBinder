import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from '../AuthModal/AuthModal';
import { CurrencySelector } from '../CurrencySelector/CurrencySelector';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import './Navbar.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/search', label: 'Search' },
  { to: '/collection', label: 'Collection' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/binder', label: 'Binders' },
];

function LogoEmblem() {
  return (
    <NavLink className="lp-logo" to="/dashboard" aria-label="YgoBindr home">
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
    </NavLink>
  );
}

export function Navbar() {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `navbar__link${isActive ? ' navbar__link--active' : ''}`;

  const drawerLinkClass = ({ isActive }: { isActive: boolean }) =>
    `navbar__drawer-link${isActive ? ' navbar__drawer-link--active' : ''}`;

  return (
    <>
      <nav className="navbar">
        <button
          className={`navbar__hamburger${drawerOpen ? ' navbar__hamburger--open' : ''}`}
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        {/* <NavLink to="/dashboard" className="navbar__logo">YgoBindr</NavLink> */}
        <LogoEmblem />

        <div className="navbar__links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Auth area — right side of desktop nav */}
        <div className="navbar__auth">
          <ThemeToggle />
          <CurrencySelector />
          {!isLoading && (
            <>
              {isLoggedIn ? (
                <>
                  <span className="navbar__user">{user!.email}</span>
                  <button className="btn btn-ghost navbar__signout" onClick={logout}>
                    Sign out
                  </button>
                </>
              ) : (
                <button className="btn btn-primary navbar__signin" onClick={() => setAuthOpen(true)}>
                  Sign in
                </button>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="navbar__drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}
      <div className={`navbar__drawer${drawerOpen ? ' navbar__drawer--open' : ''}`}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={drawerLinkClass}
            onClick={() => setDrawerOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}

        {/* Auth in drawer */}
        <div className="navbar__drawer-auth">
          <ThemeToggle />
          <div className="navbar__drawer-currency">
            <span className="navbar__drawer-currency-label">Currency</span>
            <CurrencySelector />
          </div>
          {!isLoading && (
            <>
              {isLoggedIn ? (
                <>
                  <span className="navbar__drawer-user">{user!.email}</span>
                  <button
                    className="btn btn-ghost navbar__drawer-signout"
                    onClick={() => { logout(); setDrawerOpen(false); }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary navbar__drawer-signin"
                  onClick={() => { setAuthOpen(true); setDrawerOpen(false); }}
                >
                  Sign in
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} />
      )}
    </>
  );
}
