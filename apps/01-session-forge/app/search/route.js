import { db } from '../../lib/store.js';
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
      .all(`%${query}%`);
  }

  // CORRECT: the query is encoded on its way into the document.
  return new Response(
    document_({
      theme,
      title: 'Search',
      identity: null,
      nav: config.nav,
      active: '/search',
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Search</p>
        <h1>Search the catalogue</h1>
        <p class="lede">Four thousand lines, one search box.</p>
        <form method="get" action="/search">
          <input type="search" name="q" value="${escapeHtml(query)}" placeholder="kettle">
          <button type="submit">Search</button>
        </form>
      </div>
      ${query ? `<div class="wrap"><h2>${rows.length} result${rows.length === 1 ? '' : 's'} for &ldquo;${escapeHtml(query)}&rdquo;</h2>${productGrid(rows, theme)}</div>` : '<p class="muted">Enter a term above to search.</p>'}
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
