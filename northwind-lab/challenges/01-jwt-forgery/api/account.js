import { storefront, page, identityOf, redirect } from './_lib.js';

const db = storefront();

export function GET(request) {
  const { claims } = identityOf(request);
  if (!claims?.sub) return redirect('/login');

  const user = db.prepare('SELECT display_name, clearance FROM users WHERE username = ?').get(claims.sub);

  return page(request, {
    title: 'Your account',
    identity: claims.sub,
    body: `<h1>Your account</h1><p class="lede">Signed in as ${claims.sub}.</p>
      <table>
        <tr><th>Name</th><td>${user?.display_name ?? ''}</td></tr>
        <tr><th>Clearance</th><td>${user?.clearance ?? 'none'}</td></tr>
        <tr><th>Trade pricing</th><td>${user?.clearance === 'full' ? 'Applied' : 'Not yet available'}</td></tr>
      </table>`,
  });
}
