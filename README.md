# 🏀 The Vault

AI-powered sports card collection management app + marketing website.

---

## Project Structure

```
the-vault/
├── website/              ← Marketing site (deploy to Vercel)
│   ├── index.html        ← Landing page
│   └── app-embed.html    ← Iframe placeholder (update with Vercel URL)
├── app/                  ← React + Capacitor app (create with steps below)
│   └── src/App.jsx       ← Paste basketball-card-tracker.jsx here
└── README.md
```

---

## Setup — React App

```bash
# 1. Create the Vite React app
npm create vite@latest app -- --template react
cd app
npm install

# 2. Replace src/App.jsx with the basketball-card-tracker.jsx file

# 3. Run locally
npm run dev
# App runs at http://localhost:5173
```

---

## Setup — Capacitor (iOS + Android)

```bash
cd app
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npx cap init "The Vault" "com.abazabusiness.thevault"

# Build the app first
npm run build

# Add platforms
npx cap add android
npx cap add ios

# Sync after every build
npx cap sync

# Open in Android Studio
npx cap open android

# Open in Xcode
npx cap open ios
```

---

## Deploy — Web App to Vercel

```bash
cd app
npm run build
npx vercel --prod
# Copy the deployment URL e.g. https://the-vault-app.vercel.app
```

Then update `website/index.html` line with the iframe src:
```html
<iframe src="https://the-vault-app.vercel.app" ...>
```

---

## Deploy — Website to Vercel

```bash
cd website
npx vercel --prod
# e.g. https://thevault.vercel.app or connect your custom domain
```

---

## Waitlist Email

Replace the `submitWaitlist()` function in `website/index.html` with your
email provider of choice:
- **Mailchimp** — add their embed form action URL
- **ConvertKit** — use their API endpoint
- **Loops.so** — recommended for SaaS/apps, simple REST API

---

## eBay API Keys

Keys are stored in `app/.env` (gitignored) and read via `import.meta.env`:
```js
const EBAY_CLIENT_ID = import.meta.env.VITE_EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = import.meta.env.VITE_EBAY_CLIENT_SECRET;
```

Copy `app/.env.example` → `app/.env` and fill in your credentials.

---

## Roadmap

- [ ] Firebase auth + cloud collection sync
- [ ] RevenueCat freemium / subscription
- [ ] eBay Marketplace Insights (sold comps) — pending API approval
- [ ] Price spike alerts + push notifications
- [ ] Portfolio value tracker
- [ ] Card checklist + wishlist
- [ ] PSA grading recommendation UI
- [ ] Extend to all sports memorabilia
