/**
 * Storefront data and session handling, shared by the four applications.
 *
 * Each application receives its own copy of this file with exactly one defect
 * applied by the build script, so the diff between a working implementation
 * and a broken one is always a single, reviewable change.
 *
 * Node's built-in SQLite avoids a native build step, which is what allows the
 * same code to run on Vercel and in a local checkout.
 */

import { DatabaseSync } from 'node:sqlite';
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { config } from './config.js';

const HMAC_ALGORITHM = 'sha256';
const ACCEPTED_ALGORITHM = 'HS256';

function signingSecret() {
  return process.env.JWT_SECRET ?? 'northwind-development-signing-key';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function databasePath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return `/tmp/${config.slug}-${process.pid}-${randomBytes(6).toString('hex')}.db`;
}

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
  ['NW-HOM-101', 'Stoneware Mug Set of Four', 'Home', 2600, 'public'],
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

export function flag(name) {
  const value = process.env[name];
  return value && value.trim() ? value : 'FLAG_NOT_CONFIGURED';
}

let cached = null;

export function db() {
  if (cached) return cached;
  const handle = new DatabaseSync(databasePath());
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec(SCHEMA);

  const addProduct = handle.prepare(
    'INSERT OR IGNORE INTO products (id, sku, name, category, price_cents, classification) VALUES (?, ?, ?, ?, ?, ?)',
  );
  PRODUCTS.forEach((row, index) => addProduct.run(index + 1, ...row));

  const addUser = handle.prepare(
    'INSERT OR IGNORE INTO users (id, username, password, display_name, clearance) VALUES (?, ?, ?, ?, ?)',
  );
  USERS.forEach((row, index) => addUser.run(index + 1, ...row));

  const addSettlement = handle.prepare(
    'INSERT OR IGNORE INTO settlements (id, reference, note) VALUES (?, ?, ?)',
  );
  SETTLEMENTS.forEach((row, index) => addSettlement.run(index + 1, ...row));

  // The withheld line carrying the flag. It sits in a category the public
  // filter can name and a classification the clearance predicate excludes, so
  // no legitimate query can return it.
  const sku = process.env.FLAG_SKU ?? config.flagSku;
  const exists = handle.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku);
  if (!exists) {
    addProduct.run(900, sku, flag(config.flagName), 'Trade', 0, 'withheld');
  }

  cached = handle;
  return handle;
}

export function categories() {
  return db().prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map((r) => r.category);
}

// ---------------------------------------------------------------------------
// Session tokens: the correct implementation
// ---------------------------------------------------------------------------

export function issueToken(claims, { ttlSeconds = 3600 } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: ACCEPTED_ALGORITHM, typ: 'JWT' };
  const payload = { iss: 'northwind.supply', iat: issuedAt, exp: issuedAt + ttlSeconds, ...claims };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac(HMAC_ALGORITHM, signingSecret()).update(input).digest('base64url');
  return `${input}.${signature}`;
}

/**
 * Verification the server can rely on: the algorithm is pinned by the server
 * rather than read from the token, the MAC is compared as raw bytes in
 * constant time, and expiry is enforced.
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

  // CORRECT: the server decides which algorithm is acceptable.
  if (header.alg !== ACCEPTED_ALGORITHM) return null;

  // CORRECT: raw bytes on both sides. Comparing the base64url text would
  // compare a 43-byte string against a 32-byte MAC and never match.
  const expected = createHmac(HMAC_ALGORITHM, signingSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;

  return { ...payload, _verified: true };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export function parseCookies(request) {
  const header = request.headers.get('cookie') ?? '';
  const jar = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) jar[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

export function identity(request) {
  const claims = verifyToken(parseCookies(request).session);
  if (!claims?.sub) return { claims: null, user: null };
  const user = db()
    .prepare('SELECT username, display_name, clearance FROM users WHERE username = ?')
    .get(claims.sub);
  return { claims, user: user ?? null };
}

export function isAdministrator(request) {
  return identity(request).claims?.sub === 'administrator';
}

export function sessionCookie(token, secure) {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export { createHash };