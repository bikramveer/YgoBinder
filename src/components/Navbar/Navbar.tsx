import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/search', label: 'Search' },
  { to: '/collection', label: 'Collection' },
  { to: '/to-get', label: 'To Get' },
  { to: '/binder', label: 'Binders' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `navbar__link${isActive ? ' navbar__link--active' : ''}`;

  const drawerLinkClass = ({ isActive }: { isActive: boolean }) =>
    `navbar__drawer-link${isActive ? ' navbar__drawer-link--active' : ''}`;

  return (
    <>
      <nav className="navbar">
        <button
          className={`navbar__hamburger${open ? ' navbar__hamburger--open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        <NavLink to="/" end className="navbar__logo">YgoBinder</NavLink>

        <div className="navbar__links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="navbar__drawer-overlay" onClick={() => setOpen(false)} />
      )}
      <div className={`navbar__drawer${open ? ' navbar__drawer--open' : ''}`}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={drawerLinkClass}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </>
  );
}
