import { storefront, categories, categoryChips, productGrid, page, escapeHtml } from './_lib.js';

const db = storefront({ flagName: 'FLAG_SQLI', flagSku: 'NW-TRD-901' });

export function GET(request) {
  const category = new URL(request.url).searchParams.get('category') ?? 'Home';

  // VULNERABLE (challenge 02). The filter is concatenated into the statement,
  // so the database parses it as SQL rather than as data.
  //
  // The two predicates sit on one line on purpose. A `--` comment in SQLite
  // runs to the end of the line and no further, so if the clearance filter
  // were on its own line the injected comment would not remove it, and the
  // tautology below would not reach the withheld lines. Keeping the predicate
  // pair on a single line is what makes the demonstration reproduce.
  //
  // FIX: delete the next four lines and use the parameterized statement below.
  const sql = `SELECT sku, name, category, price_cents, classification FROM products WHERE category = '${category}' AND classification = 'public' ORDER BY id`;

  let rows = [];
  let notice = null;
  try {
    rows = db.prepare(sql).all();
  } catch (error) {
    // A verbose database error is a secondary disclosure: it turns a blind
    // injection into a verbose one and confirms the query is reachable.
    notice = `We could not load that category. (${error.message})`;
  }

  return page(request, {
    title: 'Catalogue',
    identity: null,
    active: '/catalogue',
    body: `<h1>Catalogue</h1>
      <p class="lede">Trade pricing applies to accounts with full clearance.</p>
      ${notice ? `<div class="banner">${escapeHtml(notice)}</div>` : ''}
      ${categoryChips(categories(db), category)}
      ${productGrid(rows)}`,
  });
}
