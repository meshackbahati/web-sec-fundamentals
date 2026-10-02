import { storefront, json } from './_lib.js';

export function GET() {
  const db = storefront();
  const row = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  return json({ status: 'ok', service: 'northwind-supply', lines: row.n });
}
