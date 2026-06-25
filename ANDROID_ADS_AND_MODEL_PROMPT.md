# VS Code prompt — remove ads + fix the Claude model (The Vault / Android)

Paste everything in the block below into your VS Code AI assistant (Claude or Copilot Chat),
with the `the-vault` repo open. It is **idempotent** — if a change is already applied it will be
skipped. It covers the React/Capacitor source (shared by web + Android) **and** the native Android
AdMob removal.

---

```
You are working in the "the-vault" repo — a Capacitor app whose `app/` React source builds both the
web app (Vercel) and the Android app (`app/android/`). Make the following changes. After each section,
show me a diff. Do not change anything unrelated.

=== PART 1: Fix the retired Claude model ===
The model id `claude-sonnet-4-20250514` was retired by Anthropic and now returns
`404 not_found_error`, which breaks card identification. Replace every occurrence of
`claude-sonnet-4-20250514` with `claude-sonnet-4-6` across the repo. Files known to contain it:
  - app/src/App.jsx                 (const ANTHROPIC_MODEL)
  - app/src/CollectionsView.jsx     (chat fetch body: model: '...')
  - app/src/VaultChat.jsx           (const CHAT_MODEL)
  - app/api/generate-article.js     (Anthropic request body: model: "...")
  - app/api/chat.js                 (ALLOWED_MODELS array)
In app/api/chat.js, make sure `claude-sonnet-4-6` is the FIRST entry of ALLOWED_MODELS so the
allowlist guardrail accepts it; you may keep the old ids in the array for backward compatibility.
Then grep the whole repo for `claude-sonnet-4-20250514` and confirm it only remains (if at all) as a
backward-compat allowlist entry — never as the model actually sent in a request.

=== PART 2: Remove ads at the app layer (every gate becomes free) ===
The app gates uploads, AI chat, the value breakdown, daily/streak bonuses, and break exports behind a
rewarded AdMob video (AdGateModal). Make the app fully usable with NO ads:

1. app/src/useRewardProfile.js — treat every user as Pro with unlimited entitlements. Replace the
   computed `effectiveLimit`, `isPro`, and `isValueUnlocked` so they are constant:
       const effectiveLimit = Infinity;
       const isPro = true;
       const isValueUnlocked = true;
   (Leave the rest of the hook — profile loading, awardCredits, etc. — untouched.)

2. app/src/AdGateModal.jsx — replace the entire file with a no-op that never loads or shows an ad,
   never imports AdMob, immediately calls onWatched() once on mount, and renders null:
       import { useEffect, useRef } from 'react';
       export default function AdGateModal({ onWatched }) {
         const firedRef = useRef(false);
         useEffect(() => {
           if (firedRef.current) return;
           firedRef.current = true;
           onWatched?.();
         }, [onWatched]);
         return null;
       }

3. app/src/App.jsx — delete the `AdMob.initialize(...)` useEffect (the "Initialize AdMob on native
   platforms" block) and remove the `import { AdMob } from "@capacitor-community/admob";` line.

4. app/src/BreakTracker.jsx — make CSV/screenshot export download directly on every platform (no ad
   gate). Remove the `import AdGateModal ...` line, the `adGate` useState, the `handleAdWatched`
   callback, and the `<AdGateModal .../>` render. Simplify handleExportClick to:
       const handleExportClick = useCallback((type) => {
         if (type === 'csv') downloadCSV();
         if (type === 'screenshot') downloadScreenshot();
       }, [downloadCSV, downloadScreenshot]);
   Keep the `import { Capacitor }` line — it is still used elsewhere in this file.

=== PART 3: Remove the native Android AdMob SDK (clean Play Store build) ===
1. app/package.json — remove the dependency `"@capacitor-community/admob"`, and remove the
   `"postinstall": "node scripts/fix-admob-gradle.cjs"` script entry.
2. Delete the file app/scripts/fix-admob-gradle.cjs (it only patched the AdMob plugin's gradle).
3. app/android/app/src/main/AndroidManifest.xml — remove the AdMob app-id meta-data element:
       <meta-data
         android:name="com.google.android.gms.ads.APPLICATION_ID"
         android:value="ca-app-pub-8412353811123862~6095487325" />
4. Search android/ for any leftover `com.google.android.gms.ads` or `play-services-ads` references
   and remove them if present.

=== PART 4: Reinstall, build, sync, verify ===
Run from app/:
   npm install
   npm run build
   npx cap sync android
Then:
   - grep the repo for: AdMob, RewardVideoAd, @capacitor-community/admob, ca-app-pub
     → there should be NO remaining active references (comments are fine).
   - npm run lint (the build/lint should not report any NEW errors about AdMob, AdGateModal, adGate,
     or undefined imports).
Finally open app/android in Android Studio and rebuild the APK/AAB to confirm it compiles and runs
with no ads and working card identification.

Show me a summary of every file changed at the end.
```

---

## Notes
- The `app/` source is shared, so Parts 1–2 also fix the **web** build (Vercel). If you ran the
  earlier changes in this repo already, the assistant will simply confirm they're in place.
- Removing the native AdMob SDK (Part 3) is recommended so Google Play's Data Safety form and the APK
  no longer reference an ads SDK. If you'd rather keep the plugin installed for now, you can skip
  Part 3 — the app still serves zero ads, because nothing calls AdMob anymore.
- After deploying: card uploads use `claude-sonnet-4-6`, and uploads / AI chat / value breakdown /
  break exports are all unlocked with no ad prompts.
