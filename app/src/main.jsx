import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { Analytics } from '@vercel/analytics/react'

// ── eBay OAuth callback handler ───────────────────────────────────────────────
// If the React app loads inside the eBay auth popup (e.g. the Vercel catch-all
// rewrite swallows /ebay-callback.html), detect the ?code= / ?error= params,
// write them to localStorage so the parent window can read them, then close.
;(function handleEbayCallback() {
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const error = params.get('error');
  // Only act when eBay redirected back with OAuth params.
  // window.name is set to "ebay-auth" by the popup open call, or
  // window.opener is present — either confirms we're in the auth popup.
  if (!code && !error) return;
  if (window.name !== 'ebay-auth' && !window.opener) return;
  try {
    localStorage.setItem('_vault_ebay_auth', JSON.stringify({ code, error: error || null }));
  } catch (_) {}
  // also try postMessage in case opener is still reachable
  if (window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(
        { type: 'EBAY_AUTH_CODE', code, error: error || null },
        window.location.origin,
      );
    } catch (_) {}
  }
  window.close();
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <Analytics />
  </StrictMode>,
)
