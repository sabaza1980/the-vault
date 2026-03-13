import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function AuthModal({ onClose }) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = () => {
    signInWithGoogle(); // triggers redirect — page will navigate away
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, name.trim() || undefined);
      } else {
        await signInWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err.code) + ` [${err.code}]`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2 style={styles.title}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>

        <button style={styles.googleBtn} onClick={handleGoogleSignIn} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 8 }}>
            <path fill="#EA4335" d="M24 9.5c3.1 0 5.9 1.1 8.1 2.9l6-6C34.4 3.1 29.5 1 24 1 14.6 1 6.7 6.8 3.3 15l7 5.4C12 14.5 17.5 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7C43.6 37.5 46.5 31.4 46.5 24.5z"/>
            <path fill="#FBBC05" d="M10.3 28.6A14.7 14.7 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L3.3 14C1.2 17.9 0 22.3 0 26.9c0 4.6 1.2 9 3.3 12.9l7-5.2z"/>
            <path fill="#34A853" d="M24 47c5.5 0 10.1-1.8 13.5-4.9l-7.4-5.7c-1.8 1.2-4.1 2-6.1 2-6.5 0-12-4.9-13.7-11.4l-7 5.4C6.7 41.2 14.6 47 24 47z"/>
          </svg>
          Continue with Google
        </button>

        <div style={styles.divider}><span>or</span></div>

        <form onSubmit={handleEmailSubmit} style={styles.form}>
          {mode === 'signup' && (
            <input
              style={styles.input}
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={styles.toggle}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button style={styles.toggleBtn} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
    case 'auth/popup-closed-by-user': return 'Sign-in popup was closed.';
    default: return 'Something went wrong. Please try again.';
  }
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#1a1a2e', border: '1px solid #333', borderRadius: 12,
    padding: '32px 28px', width: '100%', maxWidth: 380, position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
    color: '#888', fontSize: 24, cursor: 'pointer', lineHeight: 1,
  },
  title: {
    margin: '0 0 20px', textAlign: 'center', fontSize: 22, fontWeight: 700,
    color: '#fff',
  },
  googleBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '10px 16px', background: '#fff', color: '#333', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0',
    color: '#666', fontSize: 13,
    '::before': { content: '""', flex: 1, borderTop: '1px solid #333' },
    '::after':  { content: '""', flex: 1, borderTop: '1px solid #333' },
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '10px 14px', background: '#0f0f1a', border: '1px solid #333',
    borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none',
  },
  error: { margin: 0, color: '#f87171', fontSize: 13 },
  submitBtn: {
    padding: '11px 16px', background: '#6366f1', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  toggle: { margin: '16px 0 0', textAlign: 'center', color: '#888', fontSize: 13 },
  toggleBtn: {
    background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
};
