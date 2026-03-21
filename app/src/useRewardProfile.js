import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, increment, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

const FREE_LIMIT = 3;

/**
 * Manages the user's reward profile (ad credits, streaks, session state, referrals).
 * All data lives in users/{uid} — a top-level doc separate from the cards subcollection.
 *
 * Firestore fields used:
 *   card_credits, free_limit, current_streak, longest_streak, last_login_date,
 *   ai_session_active, ai_sessions_total, value_unlock_expires_at,
 *   ads_watched_total, tier,
 *   referral_code, referral_source, referral_rewarded, referral_count
 */
export function useRewardProfile(user) {
  // Profile includes the uid so we can safely discard stale data on user change
  const [rawProfile, setRawProfile] = useState(null);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data() || {};
      // Generate referral code on first profile load if missing
      if (!d.referral_code) {
        setDoc(ref, { referral_code: user.uid }, { merge: true }).catch(() => {});
      }
      setRawProfile({
        _uid:                 user.uid,
        cardCredits:          d.card_credits           ?? 0,
        freeLimit:            d.free_limit             ?? FREE_LIMIT,
        currentStreak:        d.current_streak         ?? 0,
        longestStreak:        d.longest_streak         ?? 0,
        lastLoginDate:        d.last_login_date        ?? null,
        aiSessionActive:      d.ai_session_active      ?? false,
        aiSessionsTotal:      d.ai_sessions_total      ?? 0,
        valueUnlockExpiresAt: d.value_unlock_expires_at ?? null,
        adsWatchedTotal:      d.ads_watched_total      ?? 0,
        tier:                 d.tier                   ?? 'free',
        // Phase 2 — Referral fields
        referralCode:         d.referral_code          ?? null,
        referralSource:       d.referral_source        ?? null,
        referralRewarded:     d.referral_rewarded      ?? false,
        referralCount:        d.referral_count         ?? 0,
      });
    });
    return unsub;
  }, [user]);

  /** Generic profile update — merges into users/{uid} */
  const updateProfile = useCallback(async (updates) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
  }, [user]);

  /** Grant card credits (after a rewarded ad) */
  const awardCredits = useCallback(async (amount) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), {
      card_credits:      increment(amount),
      ads_watched_total: increment(1),
    }, { merge: true });
  }, [user]);

  /** Mark an AI chat session as active (after a rewarded ad) */
  const startAISession = useCallback(async () => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), {
      ai_session_active: true,
      ai_sessions_total: increment(1),
      ads_watched_total: increment(1),
    }, { merge: true });
  }, [user]);

  /** Mark the AI session as ended (when the chat panel closes) */
  const endAISession = useCallback(async () => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), {
      ai_session_active: false,
    }, { merge: true });
  }, [user]);

  /** Unlock collection value view for 24 hours (after a rewarded ad) */
  const unlockValueView = useCallback(async () => {
    if (!user) return;
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await setDoc(doc(db, 'users', user.uid), {
      value_unlock_expires_at: expiry,
      ads_watched_total: increment(1),
    }, { merge: true });
  }, [user]);

  /**
   * Apply a referral code captured from the ?ref= URL param on first signup.
   * Awards +20 credits to the invitee (self) and stores the referrer's uid.
   * Self-referral is blocked server-side by Firestore rules; also guarded here.
   */
  const applyReferral = useCallback(async (referrerUid) => {
    if (!user || referrerUid === user.uid) return;
    await setDoc(doc(db, 'users', user.uid), {
      referral_source:   referrerUid,
      referral_rewarded: false,   // explicit false so Firestore rule == false check passes
      card_credits:      increment(20),
    }, { merge: true });
  }, [user]);

  /**
   * Triggered when the invitee uploads their 10th card.
   * Runs a Firestore transaction to award +20 credits to the referrer and mark
   * referral_rewarded = true on this user's doc to prevent double-payment.
   * The Firestore security rule verifies invitee→referrer relationship server-side.
   */
  const triggerReferralMilestone = useCallback(async (referrerUid) => {
    if (!user || !referrerUid) return;
    const inviteeRef = doc(db, 'users', user.uid);
    const referrerRef = doc(db, 'users', referrerUid);
    try {
      await runTransaction(db, async (tx) => {
        const inviteeSnap = await tx.get(inviteeRef);
        if (inviteeSnap.data()?.referral_rewarded) return; // already paid — idempotent
        tx.update(referrerRef, {
          card_credits:   increment(20),
          referral_count: increment(1),
        });
        tx.update(inviteeRef, { referral_rewarded: true });
      });
    } catch (e) {
      console.error('Referral milestone transaction failed:', e);
    }
  }, [user]);

  // Discard stale data if uid has changed (e.g., sign out then sign in as different user)
  const profile = (user && rawProfile?._uid === user.uid) ? rawProfile : null;

  const effectiveLimit = profile
    ? profile.freeLimit + profile.cardCredits
    : FREE_LIMIT;

  const isPro = profile?.tier === 'pro';

  /** True if the collection value breakdown is currently unlocked */
  const isValueUnlocked = profile?.valueUnlockExpiresAt
    ? new Date(profile.valueUnlockExpiresAt) > new Date()
    : false;

  return {
    profile,
    effectiveLimit,
    isPro,
    isValueUnlocked,
    updateProfile,
    awardCredits,
    startAISession,
    endAISession,
    unlockValueView,
    applyReferral,
    triggerReferralMilestone,
  };
}
