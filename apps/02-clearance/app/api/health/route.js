import { db } from '../../../lib/store.js';
import { config } from '../../../lib/config.js';

export async function GET() {
  const row = db().prepare('SELECT COUNT(*) AS n FROM products').get();
  return new Response(
    JSON.stringify({ status: 'ok', application: config.slug, lines: row.n }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
