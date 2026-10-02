import { db, categories, identity } from '../../lib/store.js';
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
  const sql = `SELECT sku, name, category, price_cents, classification FROM products WHERE category = '${category}' AND classification = 'public' ORDER BY id`;

  let rows = [];
  let notice = null;
  try {
    rows = db().prepare(sql).all();
  } catch (error) {
    // A verbose database error is a second disclosure: it turns a blind
    // injection into a verbose one and confirms the query is reachable.
    notice = `We could not load that category. (${error.message})`;
  }

  return new Response(
    document_({
      theme,
      title: 'Catalogue',
      identity: user?.username ?? null,
      nav: config.nav,
      active: '/catalogue',
      body: `
    <div class="wrap" style="padding-top:56px">
      <p class="eyebrow">Catalogue</p>
      <h1>Supplier catalogue</h1>
      <p class="lede">Trade pricing applies to accounts with full clearance.</p>
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
      ${chips(categories(), category, (c) => `/catalogue?category=${encodeURIComponent(c)}`)}
      ${productGrid(rows, theme)}
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
