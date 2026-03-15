import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.reputation",
  "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.stores",
  "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
  "https://api.ebay.com/oauth/scope/sell.edelivery",
  "https://api.ebay.com/oauth/api_scope/commerce.vero",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.mapping",
  "https://api.ebay.com/oauth/api_scope/commerce.message",
  "https://api.ebay.com/oauth/api_scope/commerce.feedback",
  "https://api.ebay.com/oauth/api_scope/commerce.shipping",
].join(" ");

/**
 * Manages eBay seller OAuth state for a signed-in Vault user.
 *
 * Auth data is stored in Firestore at users/{uid}/settings/ebayAuth.
 * The access token is refreshed automatically before any listing call.
 *
 * Usage:
 *   const { ebayConnected, hasPolicies, connecting, connect, disconnect, getValidToken, ebayAuth } = useEbayAuth(user);
 */
export function useEbayAuth(user) {
  const [ebayAuth, setEbayAuth] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const popupRef = useRef(null);

  const authDocRef = user ? doc(db, "users", user.uid, "settings", "ebayAuth") : null;

  // ── Load stored auth from Firestore on mount ─────────────────────────────
  useEffect(() => {
    if (!user) { setAuthLoading(false); return; }
    setAuthLoading(true);
    getDoc(authDocRef)
      .then((snap) => { if (snap.exists()) setEbayAuth(snap.data()); })
      .catch((err) => console.warn("Could not load eBay auth:", err))
      .finally(() => setAuthLoading(false));
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared auth-code processor (stored in a ref so polls/listeners share it) ──
  //    Using a ref means both the localStorage poll and the postMessage fallback
  //    always call the latest version without stale-closure issues.
  const processCodeRef = useRef(null);
  processCodeRef.current = async ({ code, error }) => {
    if (error || !code) {
      setConnectError(error ? `eBay declined: ${error}` : "No auth code received");
      setConnecting(false);
      return;
    }
    setConnectError(null);
    try {
      // 1. Exchange auth code for user tokens (server-side — keeps secret safe)
      const tokenRes = await fetch("/api/ebay-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code }),
      });
      if (!tokenRes.ok) {
        const d = await tokenRes.json().catch(() => ({}));
        throw new Error(d.error || "Token exchange failed");
      }
      const tokenData = await tokenRes.json();

      // 2. Fetch seller policies & ensure a merchant location exists
      const policiesRes = await fetch("/api/ebay-policies", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accessToken: tokenData.accessToken }),
      });
      const policiesData = await policiesRes.json();

      const authData = {
        ...tokenData,
        ...policiesData,
        connectedAt: new Date().toISOString(),
      };

      // 3. Persist to Firestore
      if (authDocRef) await setDoc(authDocRef, authData);
      setEbayAuth(authData);
    } catch (err) {
      console.error("eBay connect error:", err);
      setConnectError(err.message || "Failed to connect eBay");
    } finally {
      setConnecting(false);
    }
  };

  // ── postMessage fallback (works when window.opener is available) ───────────
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "EBAY_AUTH_CODE") return;
      // Clear localStorage entry so the storage poll doesn't also fire
      localStorage.removeItem("_vault_ebay_auth");
      processCodeRef.current(event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open the eBay OAuth consent popup ────────────────────────────────────
  const connect = useCallback(() => {
    if (!user) return;
    setConnecting(true);
    setConnectError(null);

    const clientId = import.meta.env.VITE_EBAY_CLIENT_ID;
    const ruName   = import.meta.env.VITE_EBAY_RU_NAME;

    if (!clientId || !ruName) {
      setConnectError("eBay credentials not configured. Add VITE_EBAY_CLIENT_ID and VITE_EBAY_RU_NAME to your environment.");
      setConnecting(false);
      return;
    }

    // Clear any stale result from a previous attempt
    localStorage.removeItem("_vault_ebay_auth");

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  ruName,
      response_type: "code",
      scope:         EBAY_SCOPES,
    });

    const url   = `${EBAY_AUTH_URL}?${params}`;
    const popup = window.open(url, "ebay-auth", "width=620,height=720,scrollbars=yes,resizable=yes");
    popupRef.current = popup;

    // ── Primary: poll localStorage (reliable even when window.opener is nulled) ──
    // The callback page writes { code, error } to _vault_ebay_auth in localStorage.
    let codeHandled = false;
    const pollStorage = setInterval(() => {
      const raw = localStorage.getItem("_vault_ebay_auth");
      if (!raw) return;
      clearInterval(pollStorage);
      localStorage.removeItem("_vault_ebay_auth");
      codeHandled = true;
      try {
        processCodeRef.current(JSON.parse(raw));
      } catch (e) {
        setConnectError("Failed to parse eBay auth response.");
        setConnecting(false);
      }
    }, 300);

    // ── Fallback: detect popup closed before code arrived ────────────────────
    const pollClosed = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollClosed);
        // Keep pollStorage running a bit longer — the callback page may have written
        // to localStorage just before the popup closed and we haven't read it yet.
        // After 1.5 s, do a final check and process whatever we find.
        setTimeout(() => {
          clearInterval(pollStorage);
          if (codeHandled) return;
          const raw = localStorage.getItem("_vault_ebay_auth");
          if (raw) {
            localStorage.removeItem("_vault_ebay_auth");
            try {
              processCodeRef.current(JSON.parse(raw));
            } catch (e) {
              setConnectError("Failed to parse eBay auth response.");
              setConnecting(false);
            }
          } else {
            setConnecting(false);
            setConnectError("Popup was closed before authorisation completed.");
          }
        }, 1500);
      }
    }, 800);
  }, [user]);

  // ── Re-fetch policies using the existing token (no new OAuth popup needed) ──
  const refreshPolicies = useCallback(async () => {
    if (!ebayAuth?.accessToken) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const accessToken = await getValidToken();
      const policiesRes = await fetch("/api/ebay-policies", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ accessToken }),
      });
      const policiesData = await policiesRes.json();
      const updated = { ...ebayAuth, ...policiesData };
      if (authDocRef) await setDoc(authDocRef, updated);
      setEbayAuth(updated);
    } catch (err) {
      console.error("refreshPolicies error:", err);
      setConnectError(err.message || "Failed to refresh policies");
    } finally {
      setConnecting(false);
    }
  }, [ebayAuth, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Disconnect eBay ───────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (authDocRef) await deleteDoc(authDocRef).catch(() => {});
    setEbayAuth(null);
    setConnectError(null);
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Return a valid access token, refreshing if needed ────────────────────
  const getValidToken = useCallback(async () => {
    if (!ebayAuth?.accessToken) throw new Error("Not connected to eBay");

    // Use current token if it has more than 2 minutes remaining
    if (ebayAuth.expiresAt > Date.now() + 120_000) {
      return ebayAuth.accessToken;
    }

    // Refresh
    const res = await fetch("/api/ebay-refresh", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken: ebayAuth.refreshToken }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Token refresh failed — please reconnect eBay");
    }

    const { accessToken, expiresAt } = await res.json();
    const updated = { ...ebayAuth, accessToken, expiresAt };

    if (authDocRef) await setDoc(authDocRef, updated);
    setEbayAuth(updated);
    return accessToken;
  }, [ebayAuth, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const ebayConnected = !!ebayAuth?.accessToken;
  const hasPolicies   = !!(ebayAuth?.fulfillmentPolicyId && ebayAuth?.paymentPolicyId && ebayAuth?.returnPolicyId);
  const hasLocation   = !!ebayAuth?.merchantLocationKey;

  return {
    ebayAuth,
    ebayConnected,
    hasPolicies,
    hasLocation,
    missingPolicies: ebayAuth?.missingPolicies || null,
    authLoading,
    connecting,
    connectError,
    connect,
    disconnect,
    getValidToken,
    refreshPolicies,
  };
}
