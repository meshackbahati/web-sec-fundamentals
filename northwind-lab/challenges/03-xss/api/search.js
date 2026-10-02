import { storefront, productGrid, page } from './_lib.js';

const db = storefront({ flagName: 'FLAG_XSS', flagSku: 'NW-TRD-902' });

export function GET(request) {
  const query = new URL(request.url).searchParams.get('q') ?? '';

  // CORRECT: the search predicate is bound as a parameter.
  let rows = [];
  if (query) {
    rows = db
      .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE name LIKE ? ORDER BY id")
      .all(`%${query}%`);
  }

  // VULNERABLE (challenge 03). The same query is also interpolated into the
  // page as markup, in the results heading below. The browser parses whatever
  // it is handed.
  //
  // FIX: pass the query through escapeHtml() at that point.
  return page(request, {
    title: 'Search',
    identity: null,
    query,
    active: '/',
    body: `<h1>Search</h1>
      <p class="lede">Searching 4,000+ trade lines.</p>
      ${query ? `<h2>${rows.length} result${rows.length === 1 ? '' : 's'} for &ldquo;${query}&rdquo;</h2>` : ''}
      ${query ? productGrid(rows) : '<p class="note">Enter a term above to search the catalogue.</p>'}
      <h2>Need trade pricing?</h2>
      <p class="note">Accounts with full clearance can read the settlement schedule from the
      trading console at <code>/console</code>. It is a same-origin endpoint and expects a
      script-initiated request.</p>`,
  });
}
