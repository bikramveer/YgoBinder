import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './AuthModal.css';

type View = 'login' | 'register' | 'verify';

interface Props {
  onClose: () => void;
  onSuccess?: () => void; // called after login or email verification
}

export function AuthModal({ onClose, onSuccess }: Props) {
  const { login, register, verifyEmail } = useAuth();

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState(''); // set after register, used in verify

  function clearError() { setError(''); }

  // ── Login ────────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      await login(email, password);
      onSuccess?.();
      onClose();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(email);
        setView('verify');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Register ─────────────────────────────────────────────────────────────────

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      setPendingEmail(email);
      setView('verify');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Verify ───────────────────────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(pendingEmail || email, code);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal auth-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="auth-modal__header">
          <h2 className="auth-modal__title">
            {view === 'login' && 'Sign in'}
            {view === 'register' && 'Create account'}
            {view === 'verify' && 'Verify your email'}
          </h2>
          <button className="auth-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Login view */}
        {view === 'login' && (
          <form className="auth-modal__form" onSubmit={handleLogin}>
            <div className="auth-modal__field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="auth-modal__field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="auth-modal__error">{error}</p>}
            <button className="btn btn-primary auth-modal__submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="auth-modal__switch">
              Don't have an account?{' '}
              <button type="button" onClick={() => { setView('register'); clearError(); }}>
                Create one
              </button>
            </p>
          </form>
        )}

        {/* Register view */}
        {view === 'register' && (
          <form className="auth-modal__form" onSubmit={handleRegister}>
            <div className="auth-modal__field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="auth-modal__field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="auth-modal__field">
              <label>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="auth-modal__error">{error}</p>}
            <button className="btn btn-primary auth-modal__submit" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <p className="auth-modal__switch">
              Already have an account?{' '}
              <button type="button" onClick={() => { setView('login'); clearError(); }}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* Verify view */}
        {view === 'verify' && (
          <form className="auth-modal__form" onSubmit={handleVerify}>
            <p className="auth-modal__verify-hint">
              We sent a 6-digit code to <strong>{pendingEmail || email}</strong>.
              Enter it below to activate your account.
            </p>
            <div className="auth-modal__field">
              <label>Verification code</label>
              <input
                className="auth-modal__code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                autoFocus
              />
            </div>
            {error && <p className="auth-modal__error">{error}</p>}
            <button className="btn btn-primary auth-modal__submit" type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify email'}
            </button>
            <p className="auth-modal__switch">
              Didn't receive a code?{' '}
              <button type="button" onClick={() => { setView('register'); clearError(); }}>
                Go back
              </button>
            </p>
          </form>
        )}

      </div>
    </div>
  );
}
