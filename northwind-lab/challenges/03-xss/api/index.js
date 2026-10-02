import { storefront, categories, categoryChips, productGrid, page } from './_lib.js';

const db = storefront({ flagName: 'FLAG_XSS', flagSku: 'NW-TRD-901' });

export function GET(request) {
  const featured = db
    .prepare("SELECT sku, name, category, price_cents, classification FROM products WHERE classification = 'public' ORDER BY id LIMIT 6")
    .all();

  return page(request, {
    title: 'Home',
    identity: null,
    active: '/',
    body: `<h1>Homewares and stationery, supplied</h1>
      <p class="lede">Trade pricing for shops, studios and offices. Next-day delivery across the UK.</p>
      ${categoryChips(categories(db), null)}
      <h2>Popular this month</h2>
      ${productGrid(featured)}`,
  });
}
