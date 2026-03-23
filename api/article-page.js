/**
 * GET /blog/:slug
 * Server-renders a full article page for SEO + direct sharing.
 * Routed via root vercel.json: /blog/:slug → /api/article-page?slug=:slug
 */

const APP_API = "https://app.myvaults.io";

const CATEGORY_EMOJIS = {
  Pokemon: "⚡", MTG: "🧙", Basketball: "🏀",
  "American Football": "🏈", Soccer: "⚽", Baseball: "⚾",
  Hockey: "🏒", "Yu-Gi-Oh": "🐉", General: "🃏",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function articlePage(article) {
  const title = escapeHtml(article.title);
  const desc  = escapeHtml(article.excerpt || article.title);
  const canon = `https://www.myvaults.io/blog/${encodeURIComponent(article.slug || article.id)}`;
  const cat   = escapeHtml(article.category || "General");
  const emoji = CATEGORY_EMOJIS[article.category] || "🃏";
  const date  = formatDate(article.publishedAt);
  const tags  = (article.tags || []).slice(0, 6).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.excerpt || "",
    url: canon,
    datePublished: article.publishedAt || "",
    author: { "@type": "Organization", name: "The Vault" },
    publisher: { "@type": "Organization", name: "The Vault", url: "https://www.myvaults.io" },
    keywords: (article.tags || []).join(", "),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} | The Vault Blog</title>
  <meta name="description" content="${desc}"/>
  <link rel="canonical" href="${canon}"/>
  <meta name="robots" content="index, follow"/>

  <meta property="og:type" content="article"/>
  <meta property="og:url" content="${canon}"/>
  <meta property="og:title" content="${title} | The Vault Blog"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:image" content="https://www.myvaults.io/og-image.jpg"/>
  <meta property="og:site_name" content="The Vault"/>

  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${desc}"/>
  <meta name="twitter:image" content="https://www.myvaults.io/og-image.jpg"/>

  <script type="application/ld+json">${schema}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet"/>

  <style>
    :root { --orange:#ff6b35; --gold:#f0c040; --dark:#07070f; --dark2:#0d0d1a; --dark3:#12121f; --text:#f0f0f0; --muted:#555; }
    *{margin:0;padding:0;box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{background:var(--dark);color:var(--text);font-family:'Barlow',sans-serif;overflow-x:hidden}

    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:20px 48px;background:linear-gradient(180deg,rgba(7,7,15,0.95) 0%,transparent 100%);backdrop-filter:blur(12px)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px;background:linear-gradient(135deg,var(--orange),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-decoration:none}
    .nav-links{display:flex;align-items:center;gap:32px;list-style:none}
    .nav-links a{color:var(--muted);font-size:13px;font-weight:600;text-decoration:none;letter-spacing:1px;text-transform:uppercase;transition:color 0.2s}
    .nav-links a:hover{color:var(--text)}
    .nav-cta{background:var(--orange);color:#fff!important;padding:8px 20px;border-radius:8px;font-weight:700!important}

    main{max-width:760px;margin:0 auto;padding:120px 24px 80px;position:relative;z-index:1}

    .back-link{display:inline-flex;align-items:center;gap:6px;color:var(--orange);font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;margin-bottom:40px;opacity:0.8;transition:opacity 0.2s}
    .back-link:hover{opacity:1}

    .article-cat{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--orange);margin-bottom:16px}
    .article-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(42px,7vw,80px);letter-spacing:2px;line-height:0.95;margin-bottom:20px}
    .article-meta{display:flex;align-items:center;gap:12px;margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid rgba(255,255,255,0.06)}
    .article-date{font-size:13px;color:var(--muted)}
    .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .tag{font-size:10px;color:#444;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:4px;padding:2px 8px}

    .article-body h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(32px,5vw,56px);letter-spacing:2px;line-height:0.95;margin-bottom:24px}
    .article-body h2{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--orange);margin:40px 0 16px}
    .article-body h3{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:#ccc;margin:28px 0 12px}
    .article-body p{font-size:16px;color:#bbb;line-height:1.8;margin-bottom:20px}
    .article-body ul,.article-body ol{padding-left:24px;margin-bottom:20px}
    .article-body li{font-size:15px;color:#aaa;line-height:1.7;margin-bottom:8px}
    .article-body a{color:var(--orange);text-decoration:underline}
    .article-body strong{color:#e8e8e8;font-weight:600}
    .article-body img{display:none}
    .article-body blockquote{border-left:3px solid var(--orange);padding:12px 20px;margin:24px 0;color:#888;font-style:italic}

    .cta-block{margin-top:60px;padding:32px;background:var(--dark2);border:1px solid rgba(255,107,53,0.2);border-radius:16px;text-align:center}
    .cta-block p{color:#888;font-size:15px;margin-bottom:16px}
    .cta-btn{display:inline-block;background:var(--orange);color:#fff;padding:12px 28px;border-radius:10px;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none}
    .cta-btn:hover{opacity:0.9}

    footer{padding:40px 48px;border-top:1px solid rgba(255,255,255,0.04);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;position:relative;z-index:1}
    .footer-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;background:linear-gradient(135deg,var(--orange),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .footer-links{display:flex;gap:20px;flex-wrap:wrap}
    .footer-links a{font-size:12px;color:#555;text-decoration:none}
    .footer-links a:hover{color:var(--orange)}
    .footer-copy{font-size:12px;color:#2a2a3a}

    @media(max-width:768px){nav{padding:16px 24px}.nav-links{display:none}footer{padding:32px 24px}}
  </style>
</head>
<body>

  <nav>
    <a href="/" class="nav-logo">🃏 The Vault</a>
    <ul class="nav-links">
      <li><a href="/blog">Blog</a></li>
      <li><a href="https://app.myvaults.io" target="_blank" rel="noopener" class="nav-cta">Try It Free</a></li>
    </ul>
  </nav>

  <main>
    <a href="/blog" class="back-link">← Back to Blog</a>

    <div class="article-cat">${emoji} ${cat}</div>
    <h1 class="article-title">${title}</h1>
    <div class="article-meta">
      <span class="article-date">${date}</span>
    </div>
    ${tags ? `<div class="tags">${tags}</div><br/>` : ""}

    <div class="article-body">
      ${article.htmlContent || `<p>${escapeHtml(article.excerpt || "")}</p><p style="color:#555;font-size:14px;margin-top:32px;">Full article content is generated daily. Check back soon.</p>`}
    </div>

    <div class="cta-block">
      <p>Track your card collection with AI — identify, value and organise every card you own.</p>
      <a href="https://app.myvaults.io" class="cta-btn" target="_blank" rel="noopener">Try The Vault Free →</a>
    </div>
  </main>

  <footer>
    <div class="footer-logo">🏀 The Vault</div>
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/blog">Blog</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/terms">Terms</a>
    </div>
    <div class="footer-copy">© 2026 Abaza Business Services. All rights reserved.</div>
  </footer>

</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Article Not Found | The Vault</title><meta name="robots" content="noindex"/><style>body{background:#07070f;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#ff6b35}</style></head><body><div><h1 style="font-size:48px;margin-bottom:16px">404</h1><p>Article not found.</p><p style="margin-top:16px"><a href="/blog">← Back to Blog</a></p></div></body></html>`;
}

export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.redirect(301, "/blog");

  // Basic slug validation — alphanumeric, hyphens, underscores only
  if (!/^[\w-]+$/.test(slug)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send(notFoundPage());
  }

  try {
    const r = await fetch(`${APP_API}/api/articles?slug=${encodeURIComponent(slug)}`);

    if (r.status === 404) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(notFoundPage());
    }

    if (!r.ok) throw new Error(`API ${r.status}`);

    const article = await r.json();
    if (!article?.title) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(notFoundPage());
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300");
    return res.status(200).send(articlePage(article));
  } catch (e) {
    console.error("[article-page]", e.message);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(notFoundPage());
  }
}
