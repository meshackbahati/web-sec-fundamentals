import { db, categories, identity } from '../../lib/store.js';
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
      body: `
    <div class="wrap" style="padding-top:56px">
      <p class="eyebrow">Catalogue</p>
      <h1>Supplier catalogue</h1>
      <p class="lede">${rows.length} lines available to trade accounts. Withheld lines are visible to accounts with full clearance.</p>
      ${chips(categories(), category, (c) => `/catalogue?category=${encodeURIComponent(c)}`)}
      ${productGrid(rows, theme)}
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
