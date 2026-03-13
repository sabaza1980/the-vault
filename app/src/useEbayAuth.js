import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
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

  // ── Handle postMessage from the OAuth popup ───────────────────────────────
  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "EBAY_AUTH_CODE") return;

      const { code, error } = event.data;

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

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  ruName,
      response_type: "code",
      scope:         EBAY_SCOPES,
    });

    const url    = `${EBAY_AUTH_URL}?${params}`;
    const popup  = window.open(url, "ebay-auth", "width=620,height=720,scrollbars=yes,resizable=yes");
    popupRef.current = popup;

    // If the popup is closed without completing auth, clean up
    const pollClosed = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollClosed);
        // Only clear connecting if the postMessage handler hasn't already resolved it
        setConnecting((prev) => {
          if (prev) setConnectError("Popup was closed before authorization completed.");
          return false;
        });
      }
    }, 800);
  }, [user]);

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

  return {
    ebayAuth,
    ebayConnected,
    hasPolicies,
    missingPolicies: ebayAuth?.missingPolicies || null,
    authLoading,
    connecting,
    connectError,
    connect,
    disconnect,
    getValidToken,
  };
}
