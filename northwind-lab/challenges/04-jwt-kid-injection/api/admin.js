import { storefront, page, identityOf, forbidden, flag } from './_lib.js';

const db = storefront();

/**
 * The whole authorisation boundary is the comparison below: one claim in the
 * bearer token against one constant.
 */
export function GET(request) {
  const { claims } = identityOf(request);

  if (!claims?.sub) return forbidden('You need to sign in to reach this page.');
  if (claims.sub !== 'administrator') {
    return forbidden(
      `This area is for administrators. The session you are holding belongs to "${claims.sub}".`,
    );
  }

  const accounts = db.prepare('SELECT username, display_name, clearance FROM users ORDER BY id').all();

  return page(request, {
    title: 'Administration',
    identity: 'administrator',
    body: `<h1>Administration</h1>
      <p class="lede">Account management and trade pricing.</p>
      <div class="banner">Trade pricing key <code>${flag('FLAG_KID')}</code></div>
      <h2>Accounts</h2>
      <table>
        <tr><th>Username</th><th>Name</th><th>Clearance</th></tr>
        ${accounts.map((a) => `<tr><td>${a.username}</td><td>${a.display_name}</td><td>${a.clearance}</td></tr>`).join('')}
      </table>`,
  });
}
