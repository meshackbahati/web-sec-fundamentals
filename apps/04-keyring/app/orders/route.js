import { identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_ } from '../../lib/ui.js';

export async function GET(request) {
  const { user } = identity(request);
  if (!user) return new Response(null, { status: 302, headers: { location: '/login' } });

  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Orders',
      identity: user.username,
      nav: config.nav,
      active: '/orders',
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Orders</p>
        <h1>Orders</h1>
        <p class="lede">No orders on this account yet.</p>
      </div>
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
