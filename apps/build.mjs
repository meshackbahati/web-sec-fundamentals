#!/usr/bin/env node
/**
 * Generate the four Next.js applications.
 *
 * Each application is a separate deployment with its own identity, accent
 * colour and defect. They share one implementation so that a fix applied to
 * any of them is the same fix, and so the difference between the four is
 * exactly one marked substitution rather than four divergent code bases.
 *
 * Pages are Next.js route handlers that return complete documents. That is a
 * deliberate choice over React server components: these applications must be
 * able to answer 403 and 500 with real status codes, and must set and clear
 * session cookies on the same paths the demonstrations use.
 *
 * Usage: node apps/build.mjs
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = (name) => readFileSync(path.join(here, '_shared', name), 'utf8');

// ---------------------------------------------------------------------------
// Application definitions
// ---------------------------------------------------------------------------

const APPS = [
  {
    slug: '01-session-forge',
    theme: 'sessionForge',
    defect: 'jwt-none',
    flagName: 'FLAG_JWT',
    flagSku: 'NW-TRD-901',
    description: 'Workforce identity and session handling for Northwind Supply Co.',
    nav: [['/', 'Overview'], ['/catalogue', 'Catalogue'], ['/orders', 'Orders'], ['/support', 'Support']],
    blurb: 'Every employee signs in here. Sessions are stateless, which keeps our sign-in latency low across regions.',
  },
  {
    slug: '02-clearance',
    theme: 'clearance',
    defect: 'sqli',
    flagName: 'FLAG_SQLI',
    flagSku: 'NW-TRD-902',
    description: 'Trade pricing and clearance levels for Northwind Supply Co.',
    nav: [['/', 'Overview'], ['/catalogue', 'Catalogue'], ['/orders', 'Orders'], ['/support', 'Support']],
    blurb: 'Trade customers see supplier pricing directly. Clearance decides which price list an account sees.',
  },
  {
    slug: '03-reflector',
    theme: 'reflector',
    defect: 'xss',
    flagName: 'FLAG_XSS',
    flagSku: 'NW-TRD-903',
    description: 'Catalogue search for Northwind Supply Co.',
    nav: [['/', 'Overview'], ['/search', 'Search'], ['/orders', 'Orders'], ['/support', 'Support']],
    blurb: 'Four thousand lines, one search box. The index updates nightly from the supplier feed.',
  },
  {
    slug: '04-keyring',
    theme: 'keyring',
    defect: 'jwk',
    flagName: 'FLAG_KID',
    flagSku: 'NW-TRD-904',
    description: 'Token signing services for Northwind Supply Co.',
    nav: [['/', 'Overview'], ['/catalogue', 'Catalogue'], ['/orders', 'Orders'], ['/support', 'Support']],
    blurb: 'One signing service issues session tokens for every internal application, so keys rotate in one place.',
  },
];

// ---------------------------------------------------------------------------
// Defects
// ---------------------------------------------------------------------------

const ALG_PIN = "  if (header.alg !== ACCEPTED_ALGORITHM) return null;";

const DEFECTS = {
  'jwt-none': () =>
    shared('store.js').replace(
      ALG_PIN,
      `  // VULNERABLE (application 01). Verification is dispatched on the algorithm the
  // token itself names, so an attacker edits the header to select a branch that
  // returns the payload with no signature checked at all.
  //
  // FIX: delete the block below and keep the pinned algorithm check.
  if (header.alg === 'none') {
    const unsignedExpiry = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < unsignedExpiry) return null;
    return { ...payload, _verified: false };
  }

` + ALG_PIN,
      1,
    ),

  // Challenges 02 and 03 carry no defect in this file; theirs live in the route
  // handlers, where the query and the rendering happen.
  sqli: () => shared('store.js'),
  xss: () => shared('store.js'),

  jwk: () =>
    shared('store.js').replace(
      ALG_PIN,
      `  // VULNERABLE (application 04). When the token carries an embedded JWK the
  // server verifies with that key instead of its own, so the attacker supplies
  // the key the check is performed with.
  //
  // FIX: delete the block below and verify only with the server's own key.
  if (header.jwk && typeof header.jwk.k === 'string') {
    const embedded = createHmac(HMAC_ALGORITHM, header.jwk.k)
      .update(\`\${encodedHeader}.\${encodedPayload}\`)
      .digest();
    const given = Buffer.from(encodedSignature, 'base64url');
    if (embedded.length !== given.length || !timingSafeEqual(embedded, given)) return null;
    const embeddedExpiry = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < embeddedExpiry) return null;
    return { ...payload, _verified: false };
  }

` + ALG_PIN,
      1,
    ),
};

// ---------------------------------------------------------------------------
// File templates
// ---------------------------------------------------------------------------

function packageJson(app) {
  return JSON.stringify(
    {
      name: `northwind-${app.slug}`,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: { dev: 'next dev -p 3000', build: 'next build', start: 'next start' },
      dependencies: { next: '15.1.6', react: '19.0.0', 'react-dom': '19.0.0' },
      engines: { node: '>=22.5.0' },
    },
    null,
    2,
  ) + '\n';
}

function nextConfig() {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
}

function appConfig(app) {
  return `/**
 * Identity and behaviour for this application.
 *
 * Generated by apps/build.mjs. Edit the definitions there rather than here,
 * so the four applications stay in step.
 */

export const config = {
  slug: ${JSON.stringify(app.slug)},
  theme: ${JSON.stringify(app.theme)},
  flagName: ${JSON.stringify(app.flagName)},
  flagSku: ${JSON.stringify(app.flagSku)},
  description: ${JSON.stringify(app.description)},
  blurb: ${JSON.stringify(app.blurb)},
  nav: ${JSON.stringify(app.nav)},
};

export const APP_SLUG = config.slug;
`;
}

const ROUTES = {
  'route.js': `import { db, categories } from '../lib/store.js';
import { config } from '../lib/config.js';
import { themes, document_, productGrid } from '../lib/ui.js';

export async function GET(request) {
  const featured = db()
    .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE classification = 'public' ORDER BY id LIMIT 6")
    .all();

  const theme = themes[config.theme];

  return new Response(
    document_({
      theme,
      title: 'Overview',
      identity: null,
      nav: config.nav,
      active: '/',
      description: config.description,
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">\${theme.tag}</p>
        <h1>\${theme.name} keeps trade pricing honest.</h1>
        <p class="lede">\${config.blurb}</p>
      </div>
    </div>
    <div class="wrap">
      <h2>Popular this month</h2>
      \${productGrid(featured, theme)}
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'login/route.js': `import { db, issueToken, sessionCookie } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

function form(error) {
  return \`
    <div class="narrow" style="padding-top:56px">
      <h1>Sign in</h1>
      \${error ? \`<div class="notice">\${escapeHtml(error)}</div>\` : '<p class="lede">Access your trade account.</p>'}
      <form method="post" action="/login" class="panel">
        <div class="field">
          <label for="u">Email or username</label>
          <input id="u" name="username" type="text" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="p">Password</label>
          <input id="p" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button type="submit">Sign in</button>
      </form>
    </div>\`;
}

export async function GET(request) {
  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Sign in',
      identity: null,
      nav: config.nav,
      body: form(null),
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function POST(request) {
  const submitted = await request.formData();
  const username = String(submitted.get('username') ?? '');
  const password = String(submitted.get('password') ?? '');

  const user = db()
    .prepare('SELECT username FROM users WHERE username = ? AND password = ?')
    .get(username, password);

  if (!user) {
    return new Response(
      document_({
        theme: themes[config.theme],
        title: 'Sign in',
        identity: null,
        nav: config.nav,
        body: form('That username and password did not match an account.'),
      }),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: {
      location: '/account',
      'set-cookie': sessionCookie(issueToken({ sub: user.username }), secure),
    },
  });
}
`,

  'logout/route.js': `export async function POST() {
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
}
`,

  'account/route.js': `import { identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const { claims, user } = identity(request);

  if (!user) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Your account',
      identity: user.username,
      nav: config.nav,
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Account</p>
        <h1>Your account</h1>
        <p class="lede">Signed in as \${escapeHtml(claims.sub)}.</p>
        <div class="panel">
          <table>
            <tr><th>Name</th><td>\${escapeHtml(user.display_name)}</td></tr>
            <tr><th>Clearance</th><td>\${escapeHtml(user.clearance)}</td></tr>
            <tr><th>Trade pricing</th><td>\${user.clearance === 'full' ? 'Applied' : 'Not yet available'}</td></tr>
          </table>
        </div>
      </div>
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'admin/route.js': `import { identity, db, flag } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

/**
 * The authorisation boundary for this application is the single comparison
 * below: one claim in the bearer token against one constant.
 */
export async function GET(request) {
  const theme = themes[config.theme];
  const { claims, user } = identity(request);

  const refuse = (reason) =>
    new Response(
      document_({
        theme,
        title: 'Not available',
        identity: user?.username ?? null,
        nav: config.nav,
        body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Administration</p>
        <h1>We cannot show you that page</h1>
        <div class="notice">\${escapeHtml(reason)}</div>
        <p><a class="btn btn--ghost" href="/">Back to the overview</a></p>
      </div>
    </div>\`,
      }),
      { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );

  if (!claims?.sub) return refuse('You need to sign in to reach this page.');
  if (claims.sub !== 'administrator') {
    return refuse(\`This area is for administrators. The session you are holding belongs to "\${claims.sub}".\`);
  }

  const accounts = db()
    .prepare('SELECT username, display_name, clearance FROM users ORDER BY id')
    .all();

  return new Response(
    document_({
      theme,
      title: 'Administration',
      identity: 'administrator',
      nav: config.nav,
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Administration</p>
        <h1>Administration</h1>
        <p class="lede">Account management and trade pricing.</p>
        <div class="notice panel--accent">
          <strong>Trade pricing key</strong><br>
          <span class="token">\${escapeHtml(flag(config.flagName))}</span>
        </div>
        <h2>Accounts</h2>
        <table>
          <tr><th>Username</th><th>Name</th><th>Clearance</th></tr>
          \${accounts
            .map(
              (a) =>
                \`<tr><td>\${escapeHtml(a.username)}</td><td>\${escapeHtml(a.display_name)}</td><td>\${escapeHtml(a.clearance)}</td></tr>\`,
            )
            .join('')}
        </table>
      </div>
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'catalogue/route.js': `import { db, categories, identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, productGrid, chips, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const theme = themes[config.theme];
  const { user } = identity(request);
  const category = new URL(request.url).searchParams.get('category') ?? 'Home';

  // CORRECT for this application: the filter is bound as a parameter, so the
  // database receives it as data rather than as statement text.
  const rows = db()
    .prepare(
      "SELECT sku, name, category, price_cents, classification FROM products WHERE category = ? AND classification = 'public' ORDER BY id",
    )
    .all(category);

  return new Response(
    document_({
      theme,
      title: 'Catalogue',
      identity: user?.username ?? null,
      nav: config.nav,
      active: '/catalogue',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <p class="eyebrow">Catalogue</p>
      <h1>Supplier catalogue</h1>
      <p class="lede">\${rows.length} lines available to trade accounts. Withheld lines are visible to accounts with full clearance.</p>
      \${chips(categories(), category, (c) => \`/catalogue?category=\${encodeURIComponent(c)}\`)}
      \${productGrid(rows, theme)}
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'search/route.js': `import { db } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, productGrid, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const theme = themes[config.theme];
  const query = new URL(request.url).searchParams.get('q') ?? '';

  // CORRECT: the search predicate is bound as a parameter.
  let rows = [];
  if (query) {
    rows = db()
      .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE name LIKE ? ORDER BY id")
      .all(\`%\${query}%\`);
  }

  // CORRECT: the query is encoded on its way into the document.
  return new Response(
    document_({
      theme,
      title: 'Search',
      identity: null,
      nav: config.nav,
      active: '/search',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Search</p>
        <h1>Search the catalogue</h1>
        <p class="lede">Four thousand lines, one search box.</p>
        <form method="get" action="/search">
          <input type="search" name="q" value="\${escapeHtml(query)}" placeholder="kettle">
          <button type="submit">Search</button>
        </form>
      </div>
      \${query ? \`<div class="wrap"><h2>\${rows.length} result\${rows.length === 1 ? '' : 's'} for &ldquo;\${escapeHtml(query)}&rdquo;</h2>\${productGrid(rows, theme)}</div>\` : '<p class="muted">Enter a term above to search.</p>'}
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'console/route.js': `import { identity, flag } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { jsonResponse } from '../../lib/store.js';

/**
 * The settlement console has no interactive page. It answers only
 * script-initiated requests from an authenticated administrator, so reading it
 * requires that script actually ran in an administrator's browser.
 */
export async function GET(request) {
  const { claims } = identity(request);

  if (claims?.sub !== 'administrator') {
    return jsonResponse({ error: 'administrator session required' }, 403);
  }
  if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return jsonResponse({ error: 'this endpoint answers script-initiated requests only' }, 403);
  }

  return jsonResponse({
    endpoint: '/console',
    operator: claims.sub,
    settlement_key: flag(config.flagName),
  });
}
`,

  'orders/route.js': `import { identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_ } from '../../lib/ui.js';

export async function GET(request) {
  const { user } = identity(request);
  if (!user) return new Response(null, { status: 302, headers: { location: '/login' } });

  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Orders',
      identity: user.username,
      nav: config.nav,
      active: '/orders',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Orders</p>
        <h1>Orders</h1>
        <p class="lede">No orders on this account yet.</p>
      </div>
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'support/route.js': `import { config } from '../../lib/config.js';
import { themes, document_ } from '../../lib/ui.js';

export async function GET() {
  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Support',
      identity: null,
      nav: config.nav,
      active: '/support',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Support</p>
        <h1>Support</h1>
        <p class="lede">Trade accounts: support@northwind.example, Monday to Friday, 08:00 to 18:00.</p>
      </div>
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,

  'api/health/route.js': `import { db } from '../../../lib/store.js';
import { config } from '../../../lib/config.js';

export async function GET() {
  const row = db().prepare('SELECT COUNT(*) AS n FROM products').get();
  return new Response(
    JSON.stringify({ status: 'ok', application: config.slug, lines: row.n }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
`,
};

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const ui = shared('ui.js');

for (const app of APPS) {
  const root = path.join(here, app.slug);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });

  mkdirSync(path.join(root, 'lib'), { recursive: true });

  writeFileSync(path.join(root, 'package.json'), packageJson(app));
  writeFileSync(path.join(root, 'next.config.mjs'), nextConfig());
  writeFileSync(path.join(root, 'lib', 'config.js'), appConfig(app));
  writeFileSync(path.join(root, 'lib', 'ui.js'), ui);
  writeFileSync(path.join(root, 'lib', 'store.js'), DEFECTS[app.defect]());

  for (const [route, source] of Object.entries(ROUTES)) {
    const target = path.join(root, 'app', route);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }

  // Application 02 is the injectable one: its catalogue handler is rewritten
  // here so the defect lives in the query, not in the shared library.
  if (app.defect === 'sqli') {
    writeFileSync(
      path.join(root, 'app', 'catalogue', 'route.js'),
      `import { db, categories, identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, productGrid, chips, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const theme = themes[config.theme];
  const { user } = identity(request);
  const category = new URL(request.url).searchParams.get('category') ?? 'Home';

  // VULNERABLE (application 02). The filter is concatenated into the statement
  // text, so the database parses it as SQL rather than as data.
  //
  // Both predicates sit on one line on purpose: a double-dash comment in SQLite
  // runs to the end of the line and no further, so a multi-line predicate would
  // survive the comment and the demonstration would silently return public rows
  // only.
  //
  // FIX: delete the next two lines and use the parameterized statement below.
  const sql = \`SELECT sku, name, category, price_cents, classification FROM products WHERE category = '\${category}' AND classification = 'public' ORDER BY id\`;

  let rows = [];
  let notice = null;
  try {
    rows = db().prepare(sql).all();
  } catch (error) {
    // A verbose database error is a second disclosure: it turns a blind
    // injection into a verbose one and confirms the query is reachable.
    notice = \`We could not load that category. (\${error.message})\`;
  }

  return new Response(
    document_({
      theme,
      title: 'Catalogue',
      identity: user?.username ?? null,
      nav: config.nav,
      active: '/catalogue',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <p class="eyebrow">Catalogue</p>
      <h1>Supplier catalogue</h1>
      <p class="lede">Trade pricing applies to accounts with full clearance.</p>
      \${notice ? \`<div class="notice">\${escapeHtml(notice)}</div>\` : ''}
      \${chips(categories(), category, (c) => \`/catalogue?category=\${encodeURIComponent(c)}\`)}
      \${productGrid(rows, theme)}
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,
    );
  }

  // Application 03 reflects its query without encoding it.
  if (app.defect === 'xss') {
    writeFileSync(
      path.join(root, 'app', 'search', 'route.js'),
      `import { db } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, productGrid, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const theme = themes[config.theme];
  const query = new URL(request.url).searchParams.get('q') ?? '';

  // CORRECT: the search predicate is bound as a parameter.
  let rows = [];
  if (query) {
    rows = db()
      .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE name LIKE ? ORDER BY id")
      .all(\`%\${query}%\`);
  }

  // VULNERABLE (application 03). The same query is also interpolated into the
  // document below as markup. The browser cannot tell which characters were
  // meant as text and which as markup, so it finds a script element and runs it.
  //
  // FIX: wrap the interpolation in escapeHtml().
  return new Response(
    document_({
      theme,
      title: 'Search',
      identity: null,
      nav: config.nav,
      active: '/search',
      body: \`
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Search</p>
        <h1>Search the catalogue</h1>
        <p class="lede">Four thousand lines, one search box. The index updates nightly from the supplier feed.</p>
        <form method="get" action="/search">
          <input type="search" name="q" value="\${escapeHtml(query)}" placeholder="kettle">
          <button type="submit">Search</button>
        </form>
      </div>
      \${query ? \`<div class="wrap"><h2>\${rows.length} result\${rows.length === 1 ? '' : 's'} for &ldquo;\${query}&rdquo;</h2>\${productGrid(rows, theme)}</div>\` : ''}
      <div class="wrap"><h2>Trade settlements</h2>
        <p class="lede">Accounts with full clearance can read the settlement schedule from the trading
        console at <code>/console</code>. It answers script-initiated requests only.</p>
      </div>
    </div>\`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
`,
    );
  }

  console.log(`wrote apps/${app.slug}`);
}

console.log(`\n${APPS.length} application(s) generated.`);