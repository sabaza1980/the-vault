import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

const REWARDED_AD_UNIT_ID = 'ca-app-pub-8412353811123862/5612474852';

/**
 * Full-screen ad gate modal — shown before any rewarded action.
 *
 * Props:
 *   title        — headline, e.g. "Unlock 3 Card Slots"
 *   description  — body text explaining the reward
 *   rewardLine   — bold reward callout, e.g. "+3 card credits"
 *   streakCount  — optional: shows streak progress bar toward day 10
 *   isDismissable — whether the user can dismiss without watching
 *   onWatched    — called after rewarded ad completes
 *   onUpgrade    — called when user taps "Upgrade to Pro"
 *   onDismiss    — called when user dismisses (only if isDismissable)
 */
export default function AdGateModal({
  title,
  description,
  rewardLine,
  streakCount,
  isDismissable = false,
  onWatched,
  onUpgrade,
  onDismiss,
}) {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'loading' | 'watching' | 'error'
  const [countdown, setCountdown] = useState(0);
  const adReadyRef = useRef(false);
  const loadListenersRef = useRef([]);

  // Pre-load the rewarded ad as soon as the modal mounts so it's ready instantly.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let loadedListener, failedListener;

    const preload = async () => {
      try {
        loadedListener = await AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
          adReadyRef.current = true;
        });
        failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
          adReadyRef.current = false;
        });
        loadListenersRef.current = [loadedListener, failedListener];
        await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID });
      } catch {
        // Silently ignore — handleWatch will attempt to load again on tap.
      }
    };

    preload();

    return () => {
      loadListenersRef.current.forEach(l => l?.remove());
      loadListenersRef.current = [];
    };
  }, []);

  const handleWatch = async () => {
    if (Capacitor.isNativePlatform()) {
      // If the ad is already preloaded, go straight to watching; otherwise show loading.
      setPhase(adReadyRef.current ? 'watching' : 'loading');

      try {
        const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          rewardListener.remove();
          onWatched();
        });

        // Only prepare again if not already ready from the preload.
        if (!adReadyRef.current) {
          await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID });
          adReadyRef.current = true;
        }

        setPhase('watching');
        await AdMob.showRewardVideoAd();
        adReadyRef.current = false;
        setPhase('idle');
      } catch {
        adReadyRef.current = false;
        setPhase('error');
        setTimeout(() => setPhase('idle'), 3000);
      }
    } else {
      // Web fallback: simulated 5-second countdown
      const AD_DURATION = 5;
      setCountdown(AD_DURATION);
      setPhase('watching');
    }
  };

  useEffect(() => {
    if (phase !== 'watching' || Capacitor.isNativePlatform()) return;
    if (countdown <= 0) {
      onWatched();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, onWatched]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(14px)',
      padding: '20px',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: '#0e0e1c',
        border: '1px solid #1a1a2e',
        borderRadius: 22,
        padding: '28px 24px',
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        animation: 'fadeIn 0.18s ease',
      }}>

        {/* Title + description */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 22, fontWeight: 400, color: '#f0f0f0', marginBottom: 8,
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5,
          }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
            {description}
          </div>
        </div>

        {/* Reward badge */}
        <div style={{
          background: 'rgba(255,107,53,0.1)',
          border: '1px solid rgba(255,107,53,0.28)',
          borderRadius: 14,
          padding: '14px 20px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 28, fontWeight: 400, color: '#ff6b35',
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
          }}>
            {rewardLine}
          </div>

          {/* Streak progress (optional) */}
          {streakCount !== undefined && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                🔥 Day {streakCount} streak
              </div>
              <div style={{ height: 4, background: '#1a1a2e', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #ff6b35, #f7c59f)',
                  width: `${Math.min((streakCount / 10) * 100, 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                {streakCount >= 10 ? '10-day milestone!' : `${10 - streakCount} day${10 - streakCount !== 1 ? 's' : ''} to 10-card bonus`}
              </div>
            </div>
          )}
        </div>

        {/* Ad placeholder panel — shown during loading/watching on web */}
        {phase !== 'idle' && (
          <div style={{
            background: '#090915',
            border: '1px solid #1a1a2e',
            borderRadius: 12,
            height: 110,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            {phase === 'loading' && (
              <>
                <div style={{
                  width: 20, height: 20,
                  border: '2px solid #222', borderTopColor: '#ff6b35',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1 }}>Loading ad…</div>
              </>
            )}
            {phase === 'watching' && !Capacitor.isNativePlatform() && (
              <>
                <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1.5 }}>Advertisement</div>
                <div style={{
                  fontSize: 26, fontWeight: 400, color: '#ff6b35',
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
                }}>
                  {countdown}
                </div>
                <div style={{ fontSize: 10, color: '#2a2a3a', textTransform: 'uppercase', letterSpacing: 1 }}>Ad completing…</div>
              </>
            )}
            {phase === 'watching' && Capacitor.isNativePlatform() && (
              <>
                <div style={{
                  width: 20, height: 20,
                  border: '2px solid #222', borderTopColor: '#ff6b35',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1 }}>Opening ad…</div>
              </>
            )}
            {phase === 'error' && (
              <div style={{ fontSize: 12, color: '#666', textAlign: 'center', padding: '0 16px' }}>
                Ad unavailable. Please try again.
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {phase === 'idle' && (
            <button
              onClick={handleWatch}
              style={{
                background: 'linear-gradient(135deg, #ff6b35 0%, #f7931a 100%)',
                border: 'none', color: '#fff',
                borderRadius: 13, padding: '13px 20px',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.4,
              }}
            >
              📺 Watch Ad &amp; Claim
            </button>
          )}

          {(phase === 'watching' || phase === 'loading') && (
            <div style={{
              background: '#1a1a2e', border: '1px solid #222',
              borderRadius: 13, padding: '13px 20px',
              fontSize: 13, color: '#444', textAlign: 'center',
            }}>
              {phase === 'watching' && !Capacitor.isNativePlatform()
                ? `Watching… reward in ${countdown}s`
                : 'Ad loading…'}
            </div>
          )}

          <button
            onClick={onUpgrade}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,107,53,0.22)',
              color: '#ff6b35',
              borderRadius: 13, padding: '10px 20px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ✦ Upgrade to Pro — No Ads, Unlimited Cards
          </button>

          {isDismissable && phase === 'idle' && (
            <button
              onClick={onDismiss}
              style={{
                background: 'transparent', border: 'none',
                color: '#333', cursor: 'pointer',
                fontSize: 11, padding: '4px',
              }}
            >
              Maybe Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
