/**
 * Shared design foundation for the four Northwind applications.
 *
 * Each application is a separate deployment with its own identity, copy and
 * accent colour, but they share one design system so the set reads as a
 * coherent family rather than four unrelated demos.
 *
 * The visual language is deliberately quiet: a neutral canvas, hairline rules
 * instead of shadows, a single accent per application, and a fluid type scale.
 * Nothing here is decorative, because a target that looks designed invites
 * trust it has not earned.
 */

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const themes = {
  sessionForge: {
    name: 'Session Forge',
    tag: 'Workforce identity',
    accent: '#1f5f8b',
    accentSoft: '#eef4f8',
    canvas: '#ffffff',
    ink: '#12161c',
  },
  clearance: {
    name: 'Clearance',
    tag: 'Trade pricing',
    accent: '#7a4b12',
    accentSoft: '#f8f2ea',
    canvas: '#ffffff',
    ink: '#17140f',
  },
  reflector: {
    name: 'Reflector',
    tag: 'Catalogue search',
    accent: '#2f5d3a',
    accentSoft: '#eef4ef',
    canvas: '#ffffff',
    ink: '#121712',
  },
  keyring: {
    name: 'Keyring',
    tag: 'Signing services',
    accent: '#5a2f52',
    accentSoft: '#f5eef4',
    canvas: '#ffffff',
    ink: '#161217',
  },
};

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

export function stylesheet(theme) {
  return `
:root {
  --accent: ${theme.accent};
  --accent-soft: ${theme.accentSoft};
  --canvas: ${theme.canvas};
  --ink: ${theme.ink};
  --muted: #616a74;
  --rule: #e4e7ea;
  --wash: #f7f8f9;
  --measure: 68ch;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font: 16px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-feature-settings: "kern";
}

a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }

/* Layout ------------------------------------------------------------------ */

.shell { display: flex; flex-direction: column; min-height: 100vh; }

.masthead {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--canvas) 88%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--rule);
}

.masthead__inner {
  max-width: 1120px; margin: 0 auto; padding: 0 24px;
  display: flex; align-items: center; gap: 28px; height: 66px;
}

.wordmark { font-weight: 640; font-size: 17px; letter-spacing: -0.015em; color: var(--ink); text-decoration: none; white-space: nowrap; }
.wordmark span { color: var(--accent); }

.nav { display: flex; gap: 20px; }
.nav a { color: var(--muted); font-size: 14.5px; text-decoration: none; }
.nav a[aria-current="page"] { color: var(--ink); box-shadow: inset 0 -2px 0 var(--accent); }

.masthead__spacer { flex: 1; }

.account { font-size: 14px; color: var(--muted); text-decoration: none; white-space: nowrap; }

main { flex: 1; }

.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.narrow { max-width: var(--measure); }

/* Type -------------------------------------------------------------------- */

h1 { font-size: clamp(28px, 4.2vw, 38px); line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 10px; }
h2 { font-size: 20px; letter-spacing: -0.012em; margin: 44px 0 14px; }
h3 { font-size: 16px; margin: 0 0 6px; }

.lede { color: var(--muted); font-size: 17.5px; margin: 0 0 28px; max-width: var(--measure); }
.muted { color: var(--muted); }
.small { font-size: 13.5px; }

.eyebrow {
  font-size: 12px; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 14px; font-weight: 600;
}

/* Surfaces ---------------------------------------------------------------- */

.panel { border: 1px solid var(--rule); border-radius: 10px; padding: 22px; background: var(--canvas); }
.panel--wash { background: var(--wash); }
.panel--accent { border-color: color-mix(in srgb, var(--accent) 28%, var(--rule)); background: var(--accent-soft); }

.notice {
  border: 1px solid var(--rule); border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 22px 0;
  background: var(--wash); font-size: 15px;
}

.token {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px; background: var(--wash); border: 1px solid var(--rule);
  border-radius: 6px; padding: 3px 8px; word-break: break-all;
}

/* Controls ---------------------------------------------------------------- */

button, .btn {
  font: inherit; font-size: 14.5px; cursor: pointer;
  padding: 9px 17px; border-radius: 8px;
  border: 1px solid var(--accent); background: var(--accent); color: #fff;
  text-decoration: none; display: inline-block;
}
.btn--ghost, button.ghost { background: transparent; color: var(--accent); }
button.ghost { border-color: var(--rule); color: var(--muted); }

input[type=text], input[type=password], input[type=search] {
  font: inherit; font-size: 15px; padding: 10px 13px; width: 100%;
  max-width: 380px; color: var(--ink); background: var(--canvas);
  border: 1px solid var(--rule); border-radius: 8px;
}
input:focus-visible, button:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

.field { margin: 0 0 16px; }
.field label { display: block; font-size: 13.5px; color: var(--muted); margin-bottom: 6px; }

/* Product grid ------------------------------------------------------------ */

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(224px, 1fr)); gap: 22px; margin: 20px 0; }

.card { border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; background: var(--canvas); }
.card__media { aspect-ratio: 4 / 3; border-bottom: 1px solid var(--rule); }
.card__body { padding: 14px 15px 16px; }
.card__name { font-size: 15px; margin: 0 0 4px; }
.card__sku { font-size: 11.5px; color: var(--muted); letter-spacing: 0.04em; margin: 0; }
.card__price { font-size: 15.5px; margin: 10px 0 0; font-variant-numeric: tabular-nums; }

.badge {
  display: inline-block; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 7px; border: 1px solid var(--rule); border-radius: 999px;
  color: var(--muted); margin-left: 8px; vertical-align: 2px;
}
.card--restricted { border-color: color-mix(in srgb, var(--accent) 22%, var(--rule)); }

/* Tables ------------------------------------------------------------------ */

table { width: 100%; border-collapse: collapse; margin: 18px 0; }
th, td { text-align: left; padding: 11px 12px; border-bottom: 1px solid var(--rule); font-size: 14.5px; }
th { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Chips ------------------------------------------------------------------- */

.chips { display: flex; flex-wrap: wrap; gap: 9px; margin: 0 0 8px; }
.chip {
  font-size: 13.5px; padding: 7px 15px; border-radius: 999px;
  border: 1px solid var(--rule); color: var(--muted); text-decoration: none; background: var(--canvas);
}
.chip[aria-current="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

/* Footer ------------------------------------------------------------------ */

.footer { border-top: 1px solid var(--rule); background: var(--wash); margin-top: 64px; }
.footer__inner { max-width: 1120px; margin: 0 auto; padding: 40px 24px; display: grid; gap: 30px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.footer h4 { font-size: 12px; letter-spacing: 0.07em; text-transform: uppercase; margin: 0 0 12px; }
.footer ul { list-style: none; margin: 0; padding: 0; }
.footer li { margin-bottom: 8px; }
.footer p { margin: 0; color: var(--muted); font-size: 14px; }

/* Prose ------------------------------------------------------------------- */

.prose p { max-width: var(--measure); }
.prose ul { max-width: var(--measure); color: var(--muted); }
.prose li { margin-bottom: 7px; }
.prose code, .token code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13.5px; background: var(--wash); border: 1px solid var(--rule);
  border-radius: 5px; padding: 1px 6px;
}

@media (max-width: 640px) {
  .masthead__inner { height: auto; padding: 14px 24px; flex-wrap: wrap; gap: 14px; }
  .nav { order: 3; width: 100%; }
}
`.trim();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

/**
 * Product imagery is generated rather than fetched so every application
 * renders identically with no network access, which matters when a talk is
 * delivered from a venue with unreliable connectivity.
 */
export function media(sku, theme) {
  const seed = [...String(sku)].reduce((total, c) => total + c.charCodeAt(0), 0);
  const hue = seed % 360;
  return `<div class="card__media" style="background:hsl(${hue} 20% 95%)"></div>`;
}

export function money(cents) {
  return (Number(cents) / 100).toFixed(2);
}

export function productCard(product, theme) {
  const sku = String(product.sku ?? '');
  const name = String(product.name ?? '');
  const classification = String(product.classification ?? '');
  return `<article class="card${classification === 'withheld' ? ' card--restricted' : ''}">
    ${media(sku, theme)}
    <div class="card__body">
      <p class="card__name">${escapeHtml(name)}<span class="badge">${escapeHtml(classification)}</span></p>
      <p class="card__sku">${escapeHtml(sku)}</p>
      <p class="card__price">£${money(product.price_cents)}</p>
    </div>
  </article>`;
}

export function productGrid(products, theme) {
  if (!products.length) {
    return '<p class="muted">Nothing matched that filter.</p>';
  }
  return `<div class="grid">${products.map((p) => productCard(p, theme)).join('')}</div>`;
}

export function chips(items, active, hrefFor) {
  return `<div class="chips">${items
    .map((item) => {
      const current = item === active;
      return `<a class="chip" href="${hrefFor(item)}"${current ? ' aria-current="true"' : ''}>${escapeHtml(item)}</a>`;
    })
    .join('')}</div>`;
}

/**
 * The application shell. `body` is trusted markup produced by this module;
 * any untrusted value must be passed through escapeHtml or, where the
 * challenge requires it, deliberately not.
 */
export function document_({ theme, title, identity, nav = [], active, body, description }) {
  const links = nav
    .map(([href, label]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`)
    .join('');

  const session = identity
    ? `<span class="account">${escapeHtml(identity)}</span>`
    : '<a class="account" href="/login">Sign in</a>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(theme.name)}</title>
<meta name="description" content="${escapeHtml(description ?? theme.tag)}">
<style>${stylesheet(theme)}</style>
</head>
<body>
<div class="shell">
  <header class="masthead"><div class="masthead__inner">
    <a class="wordmark" href="/">${escapeHtml(theme.name)}<span>.</span></a>
    <nav class="nav">${links}</nav>
    <span class="masthead__spacer"></span>
    ${session}
  </div></header>
  <main><div class="wrap">${body}</div></main>
  <footer class="footer"><div class="footer__inner">
    <div><h4>${escapeHtml(theme.name)}</h4><p>${escapeHtml(theme.tag)}. Authorised testing deployment.</p></div>
    <div><h4>Product</h4><ul>
      <li><a href="/catalogue">Catalogue</a></li>
      <li><a href="/search">Search</a></li>
      <li><a href="/orders">Orders</a></li>
    </ul></div>
    <div><h4>Account</h4><ul>
      <li><a href="/account">Your details</a></li>
      <li><a href="/admin">Administration</a></li>
      <li><a href="/support">Support</a></li>
    </ul></div>
    <div><h4>Purpose</h4><p>A deliberately vulnerable application built for a security talk. It contains
    real defects and holds no real data. Use only where you are authorised to test.</p></div>
  </div></footer>
</div>
</body>
</html>`;
}

export function htmlDocument(options) {
  return new Response(document_(options), {
    status: options.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}