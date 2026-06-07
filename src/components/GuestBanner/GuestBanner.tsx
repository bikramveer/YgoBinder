import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from '../AuthModal/AuthModal';
import './GuestBanner.css';

const DISMISSED_KEY = 'guestBannerDismissed';

export function GuestBanner() {
  const { isLoggedIn, isLoading } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
  );
  const [authOpen, setAuthOpen] = useState(false);

  if (isLoading || isLoggedIn || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <>
      <div className="guest-banner">
        <span className="guest-banner__text">
          You're browsing as a guest — your data is saved locally and won't sync across devices.
          {' '}
          <button className="guest-banner__action" onClick={() => setAuthOpen(true)}>
            Sign in or create an account
          </button>
          {' '}to save it to the cloud.
        </span>
        <button className="guest-banner__close" onClick={handleDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}
