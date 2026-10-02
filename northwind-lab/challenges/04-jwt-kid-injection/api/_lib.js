/**
 * Correct reference implementations shared by the four challenges.
 *
 * Each challenge copies this file into its own tree and then introduces
 * exactly one defect. Keeping a correct version here makes the diff between
 * "vulnerable" and "fixed" a single reviewable change, which is the point of
 * the exercise.
 *
 * The interface is an ordinary wholesale storefront. The defects are hidden
 * inside routine features (a category filter, a search box, an account area)
 * because a demonstration loses its force when the target looks like a
 * target.
 *
 * There are no dependencies: Node has provided a Web-standard Request and
 * Response since v18 and node:sqlite since v22.5.
 */

import { DatabaseSync } from 'node:sqlite';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * On Vercel the filesystem is read-only apart from /tmp and every cold start
 * gets a fresh instance, so the database is seeded into /tmp. DB_PATH makes it
 * durable instead, which is what a local or long-lived deployment wants.
 */
export function databasePath() {
  if (process.env.DB_PATH) {
    return { path: process.env.DB_PATH, ephemeral: false };
  }
  return {
    path: `/tmp/northwind-${process.pid}-${randomBytes(6).toString('hex')}.db`,
    ephemeral: true,
  };
}

export function openDatabase(schema, seed) {
  const { path, ephemeral } = databasePath();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(schema);
  seed(db);
  if (ephemeral) {
    process.on('exit', () => {
      try {
        db.close();
      } catch {
        // A cleanup failure must never mask the real exit reason.
      }
    });
  }
  return db;
}

// ---------------------------------------------------------------------------
// Session tokens: the correct version
// ---------------------------------------------------------------------------

const HMAC_ALGORITHM = 'sha256';
const ACCEPTED_ALGORITHM = 'HS256';

// The signing key is addressed by filename under KEY_DIR, which must end in a
// path separator because verifyToken concatenates it with `kid` directly.
const DEFAULT_KEY_ID = process.env.KEY_ID ?? 'key-2026-01.key';

// Resolved to an absolute path at import time so the key lookup behaves the
// same on a laptop and on a serverless runtime whose working directory
// differs. The concatenation in verifyToken remains the defect.
const KEY_ROOT = resolve(process.env.KEY_DIR ?? './keys') + '/';

function signingSecret() {
  return process.env.JWT_SECRET ?? 'northwind-lab-signing-key';
}

export function issueToken(claims, { ttlSeconds = 3600, kid } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: ACCEPTED_ALGORITHM, typ: 'JWT', kid: kid ?? DEFAULT_KEY_ID };
  const payload = {
    iss: 'northwind.supply',
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    ...claims,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${encodedHeader}.${encodedPayload}`;
  // The signing key is located the same way the verifier locates it: by the
  // `kid` recorded in the header. Both halves trusting `kid` is the defect.
  const key = readFileSync(KEY_ROOT + String(header.kid ?? ''), 'utf8');
  const signature = createHmac(HMAC_ALGORITHM, key).update(input).digest('base64url');
  return `${input}.${signature}`;
}

/**
 * Verification a server can rely on.
 *
 * The algorithm is chosen by the server rather than read from the token, the
 * MAC is compared in constant time, and expiry is enforced.
 */
export function verifyToken(token) {
  if (typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // VULNERABLE (challenge 04). The verification key is located by a path the
  // token supplies, so the attacker chooses which file is read.
  // FIX: ignore `kid` for key lookup and use the configured secret only.
  if (header.alg !== ACCEPTED_ALGORITHM) return null;

  let key;
  try {
    const kid = String(header.kid ?? '');
    // The concatenation is the defect: no normalisation, no confinement to a
    // key directory, and the traversal reaches an arbitrary file.
    key = readFileSync(KEY_ROOT + kid, 'utf8');
  } catch {
    return null;
  }

  const expected = createHmac(HMAC_ALGORITHM, key)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;
  return { ...payload, _verified: true };
}

function verifyTokenUnusedReference() {
  if (header.alg !== ACCEPTED_ALGORITHM) return null;

  // Compare raw bytes: digest() with no encoding argument yields 32 bytes, and
  // Buffer.from(..., 'base64url') decodes the received segment to the same 32
  // bytes. Comparing the base64url text would compare 43 ASCII bytes to a
  // 32-byte MAC and never match.
  const expected = createHmac(HMAC_ALGORITHM, signingSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;

  return { ...payload, _verified: true };
}

export function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) jar[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * The single output-encoding helper. Every rendering defect in these
 * challenges is repaired by routing the offending value through it.
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function forbidden(what) {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Northwind Supply Co.</title>
     <style>body{font:15px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#1a1a1a}
     h1{font-size:20px} a{color:#1f5f8b}</style></head>
     <body><h1>We cannot show you that page</h1><p>${escapeHtml(what)}</p><p><a href="/">Back to the shop</a></p></body></html>`,
    403,
  );
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function identityOf(request, verify = verifyToken) {
  const jar = parseCookies(request.headers.get('cookie'));
  return { jar, claims: verify(jar.session) };
}

/**
 * Flags are read from the environment at request time and never appear in the
 * source tree, the deployment, or any response an unauthenticated client can
 * reach.
 */
export function flag(name) {
  const value = process.env[name];
  return value && value.trim() ? value : 'FLAG_NOT_CONFIGURED';
}

// ---------------------------------------------------------------------------
// Storefront presentation
// ---------------------------------------------------------------------------

const ACCENT = '#1f5f8b';

/**
 * One accent colour, hairline rules, no gradients or decorative shadows.
 * Product imagery is a neutral placeholder block so the storefront renders
 * identically with no network access.
 */
export function layout({ title, identity, query, body, active = '' }) {
  const session = identity
    ? `<a class="account" href="${identity === 'administrator' ? '/admin' : '/account'}">${escapeHtml(identity)}</a>
       <form method="post" action="/logout" class="inline"><button class="link" type="submit">Sign out</button></form>`
    : '<a class="account" href="/login">Sign in</a>';

  const nav = [
    ['/', 'Shop'],
    ['/catalogue', 'Catalogue'],
    ['/orders', 'Orders'],
    ['/support', 'Support'],
  ]
    .map(([href, label]) =>
      `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Northwind Supply Co.</title>
<style>
  :root { --accent:${ACCENT}; --ink:#14181d; --muted:#666e78; --rule:#e3e6ea; --wash:#f6f7f9; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:#fff; }
  a { color:var(--accent); }
  .wrap { max-width:1040px; margin:0 auto; padding:0 20px; }
  header { border-bottom:1px solid var(--rule); background:#fff; position:sticky; top:0; z-index:10; }
  .top { display:flex; align-items:center; gap:22px; height:62px; }
  .logo { font-weight:650; letter-spacing:-.01em; font-size:17px; color:var(--ink); text-decoration:none; white-space:nowrap; }
  .logo span { color:var(--accent); }
  nav { display:flex; gap:18px; }
  nav a { color:var(--muted); text-decoration:none; font-size:14px; }
  nav a.on, nav a:hover { color:var(--ink); }
  header form.search { display:flex; flex:1; max-width:420px; }
  header input[type=search] { flex:1; font:inherit; font-size:14px; padding:7px 12px;
    border:1px solid var(--rule); border-right:0; background:var(--wash); }
  header button { font:inherit; font-size:14px; padding:7px 14px; border:1px solid var(--rule);
    background:#fff; color:var(--muted); cursor:pointer; }
  .account { font-size:14px; color:var(--ink); text-decoration:none; white-space:nowrap; }
  .cart { font-size:14px; color:var(--muted); text-decoration:none; white-space:nowrap; }
  main { padding:30px 0 72px; }
  h1 { font-size:24px; letter-spacing:-.015em; margin:0 0 6px; }
  h2 { font-size:17px; margin:34px 0 12px; letter-spacing:-.01em; }
  p.lede { color:var(--muted); margin:0 0 22px; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 24px; }
  .chip { font-size:13px; padding:6px 13px; border:1px solid var(--rule); color:var(--muted);
          text-decoration:none; background:#fff; }
  .chip.on { border-color:var(--accent); color:var(--accent); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:20px; }
  .card { border:1px solid var(--rule); background:#fff; }
  .thumb { aspect-ratio:4/3; background:var(--wash); border-bottom:1px solid var(--rule);
           display:flex; align-items:center; justify-content:center; color:#b9c0c8; font-size:12px; letter-spacing:.06em; }
  .card .body { padding:12px 13px 14px; }
  .card .name { font-size:14px; margin:0 0 3px; }
  .card .sku { font-size:11px; color:var(--muted); letter-spacing:.04em; }
  .card .price { font-size:15px; margin-top:9px; font-variant-numeric:tabular-nums; }
  .badge { display:inline-block; font-size:10px; text-transform:uppercase; letter-spacing:.06em;
           padding:2px 6px; border:1px solid var(--rule); color:var(--muted); margin-left:6px; vertical-align:2px; }
  .withheld { border-color:#e8c9c9; }
  .withheld .thumb { background:#fbf4f4; color:#c9a6a6; }
  .banner { border:1px solid var(--rule); border-left:3px solid var(--accent); padding:11px 15px;
            margin:18px 0; font-size:14px; background:var(--wash); }
  table { border-collapse:collapse; width:100%; }
  th,td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--rule); font-size:14px; }
  th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .field { margin:0 0 14px; }
  .field label { display:block; font-size:13px; color:var(--muted); margin-bottom:5px; }
  input[type=text],input[type=password],input[type=search] { font:inherit; font-size:14px; padding:8px 11px;
    border:1px solid var(--rule); width:100%; max-width:380px; }
  button,.button { font:inherit; font-size:14px; padding:8px 15px; border:1px solid var(--accent);
                   background:var(--accent); color:#fff; cursor:pointer; text-decoration:none; }
  button.link, .btnline { background:#fff; color:var(--accent); }
  .inline { display:inline; }
  .note { color:var(--muted); font-size:13px; }
  code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; }
  footer { border-top:1px solid var(--rule); background:var(--wash); padding:34px 0; color:var(--muted); font-size:13px; }
  .cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:24px; }
  footer h3 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink); margin:0 0 9px; }
  footer ul { list-style:none; margin:0; padding:0; }
  footer li { margin-bottom:6px; }
</style></head>
<body>
<header><div class="wrap top">
  <a class="logo" href="/">northwind<span>.</span>supply</a>
  <nav>${nav}</nav>
  <form class="search" method="get" action="/search">
    <input type="search" name="q" placeholder="Search 4,000 lines"${query ? ` value="${escapeHtml(query)}"` : ''}>
    <button type="submit">Search</button>
  </form>
  <span class="spacer"></span>
  ${session}
  <a class="cart" href="/cart">Cart (0)</a>
</div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap cols">
  <div><h3>Northwind Supply Co.</h3>
    <p>Wholesale homewares and stationery since 1998.<br>Unit 12, Ravelston Trade Park.</p></div>
  <div><h3>Orders</h3><ul>
    <li><a href="/orders">Order history</a></li><li><a href="/orders">Invoices</a></li>
    <li><a href="/orders">Returns</a></li></ul></div>
  <div><h3>Account</h3><ul>
    <li><a href="/account">Your details</a></li><li><a href="/admin">Administration</a></li>
    <li><a href="/support">Contact us</a></li></ul></div>
  <div><h3>Prices</h3><p>Trade pricing applies to accounts<br>with full clearance. <a href="/support">Ask about an account</a>.</p></div>
</div></footer>
</body></html>`;
}

export function page(request, options) {
  return html(layout(options));
}

export function money(cents) {
  return (Number(cents) / 100).toFixed(2);
}

/**
 * Product grid. Withheld lines are rendered like any other card apart from a
 * small marker, so that seeing one at all means the access control has already
 * been defeated.
 */
export function productGrid(products) {
  if (!products.length) return '<p class="note">Nothing matched that filter.</p>';
  return `<div class="grid">${products
    .map((p) => {
      // Catalogue columns are treated as untrusted text: an injection can put
      // arbitrary values into them, including NULL.
      const sku = String(p.sku ?? '');
      const name = String(p.name ?? '');
      const classification = String(p.classification ?? '');
      return `<div class="card${classification === 'withheld' ? ' withheld' : ''}">
        ${abstractArt(sku)}
        <div class="body">
          <p class="name">${escapeHtml(name)}<span class="badge">${escapeHtml(classification)}</span></p>
          <p class="sku">${escapeHtml(sku)}</p>
          <p class="price">£${money(p.price_cents)}</p>
        </div>
      </div>`;
    })
    .join('')}</div>`;
}

export function categoryChips(categories, active) {
  return `<div class="chips">${categories
    .map(
      (c) =>
        `<a class="chip${c === active ? ' on' : ''}" href="/catalogue?category=${encodeURIComponent(c)}">${escapeHtml(c)}</a>`,
    )
    .join('')}</div>`;
}

/**
 * Product imagery is generated rather than fetched so the storefront renders
 * identically with no network access, which matters when a presentation is
 * delivered from a venue with unreliable connectivity.
 */
export function abstractArt(sku) {
  const hue = [...String(sku)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<div class="thumb" style="background:hsl(${hue} 18% 95%);color:hsl(${hue} 14% 68%)">${escapeHtml(
    String(sku).split('-')[1] ?? '',
  )}</div>`;
}

/**
 * The storefront database. Seeded identically for every challenge so the
 * four deployments look like the same shop, with the flag material held in a
 * withheld row that ordinary queries cannot reach.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL, price_cents INTEGER NOT NULL, classification TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
  display_name TEXT NOT NULL, clearance TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY, reference TEXT NOT NULL, note TEXT NOT NULL
);`;

const PRODUCTS = [
  ['NW-HOM-101', 'Stoneware Mug Set of 4', 'Home', 2600, 'public'],
  ['NW-HOM-102', 'Linen Tea Towel, Sand', 'Home', 1800, 'public'],
  ['NW-HOM-103', 'Recycled Wool Throw', 'Home', 8900, 'public'],
  ['NW-HOM-104', 'Oak Serving Board', 'Home', 4600, 'public'],
  ['NW-OFC-201', 'A5 Notebook, Dot Grid', 'Office', 900, 'public'],
  ['NW-OFC-202', 'Brass Desk Lamp', 'Office', 12500, 'public'],
  ['NW-OFC-203', 'Felt Desk Pad', 'Office', 2400, 'public'],
  ['NW-GFT-301', 'Enamel Kettle 1.7L', 'Gifts', 4200, 'public'],
  ['NW-GFT-302', 'Ceramic Planter, Large', 'Gifts', 3400, 'public'],
  ['NW-GFT-303', 'Beeswax Candle Set', 'Gifts', 2100, 'public'],
  ['NW-PKG-401', 'Kraft Mailer, Pack of 50', 'Packaging', 1200, 'public'],
  ['NW-PKG-402', 'Void Fill Paper, 5kg', 'Packaging', 3100, 'public'],
  ['NW-TRD-501', 'Q3 Supplier Price List', 'Trade', 1, 'withheld'],
  ['NW-TRD-502', 'Unlisted Vendor Lot', 'Trade', 2, 'withheld'],
  ['NW-TRD-503', 'Clearance Reconciliation', 'Trade', 3, 'withheld'],
];

const USERS = [
  ['wiener', 'peter', 'Wiener Vogel', 'standard'],
  ['administrator', 'admin', 'A. Okafor', 'full'],
  ['carlos', 'carlos', 'Carlos Montoya', 'standard'],
];

const SETTLEMENTS = [
  ['SET-2026-0441', 'cleared'],
  ['SET-2026-0442', 'pending review'],
];

export function storefront({ flagName, flagSku } = {}) {
  // One database per (flag, sku) pair for the lifetime of the process. Without
  // this cache each route module would open its own file in /tmp, so writes
  // made by one handler would be invisible to the next.
  const cacheKey = `${flagName ?? ''}:${flagSku ?? ''}`;
  if (storefront.cache.has(cacheKey)) return storefront.cache.get(cacheKey);

  const db = openDatabase(SCHEMA, (handle) => {
    const addProduct = handle.prepare(
      'INSERT OR IGNORE INTO products (id, sku, name, category, price_cents, classification) VALUES (?, ?, ?, ?, ?, ?)',
    );
    PRODUCTS.forEach((row, index) => addProduct.run(index + 1, ...row));

    if (flagName) {
      addProduct.run(900, flagSku ?? 'NW-TRD-900', flag(flagName), 'Trade', 0, 'withheld');
    }

    const addUser = handle.prepare(
      'INSERT OR IGNORE INTO users (id, username, password, display_name, clearance) VALUES (?, ?, ?, ?, ?)',
    );
    USERS.forEach((row, index) => addUser.run(index + 1, ...row));

    const addSettlement = handle.prepare(
      'INSERT OR IGNORE INTO settlements (id, reference, note) VALUES (?, ?, ?)',
    );
    SETTLEMENTS.forEach((row, index) => addSettlement.run(index + 1, ...row));
  });

  storefront.cache.set(cacheKey, db);
  return db;
}
storefront.cache = new Map();

export function categories(db) {
  return db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map((r) => r.category);
}