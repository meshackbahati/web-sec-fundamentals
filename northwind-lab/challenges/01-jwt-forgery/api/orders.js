import { page, identityOf, redirect } from './_lib.js';
export function GET(request) {
  const { claims } = identityOf(request);
  if (!claims?.sub) return redirect('/login');
  return page(request, { title: 'Orders', identity: claims.sub, body: `<h1>Orders</h1><p class="lede">No orders on this account yet.</p>` });
}
