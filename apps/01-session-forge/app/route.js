import { db, categories } from '../lib/store.js';
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
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">${theme.tag}</p>
        <h1>${theme.name} keeps trade pricing honest.</h1>
        <p class="lede">${config.blurb}</p>
      </div>
    </div>
    <div class="wrap">
      <h2>Popular this month</h2>
      ${productGrid(featured, theme)}
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
