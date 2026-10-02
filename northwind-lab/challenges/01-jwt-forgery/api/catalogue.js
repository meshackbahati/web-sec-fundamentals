import { storefront, categories, categoryChips, productGrid, page } from './_lib.js';

const db = storefront();

export function GET(request) {
  const category = new URL(request.url).searchParams.get('category') ?? 'Home';

  // CORRECT: the filter value is bound as a parameter, so it is data rather
  // than statement text.
  const rows = db
    .prepare(
      "SELECT sku, name, category, price_cents, classification FROM products WHERE category = ? AND classification = 'public' ORDER BY id",
    )
    .all(category);

  return page(request, {
    title: 'Catalogue',
    identity: null,
    active: '/catalogue',
    body: `<h1>Catalogue</h1>
      <p class="lede">${rows.length} lines available to trade accounts.</p>
      ${categoryChips(categories(db), category)}
      ${productGrid(rows)}`,
  });
}
