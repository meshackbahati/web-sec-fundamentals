import { storefront, categories, categoryChips, productGrid, page, identityOf } from './_lib.js';

const db = storefront();

export function GET(request) {
  const { claims } = identityOf(request);
  const featured = db
    .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE classification = 'public' ORDER BY id LIMIT 6")
    .all();

  return page(request, {
    title: 'Home',
    identity: claims?.sub ?? null,
    active: '/',
    body: `<h1>Homewares and stationery, supplied</h1>
      <p class="lede">Trade pricing for shops, studios and offices. Next-day delivery across the UK.</p>
      ${categoryChips(categories(db), null)}
      <h2>Popular this month</h2>
      ${productGrid(featured)}`,
  });
}
