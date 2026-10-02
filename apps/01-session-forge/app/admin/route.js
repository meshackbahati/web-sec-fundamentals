import { identity, db, flag } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

/**
 * The authorisation boundary for this application is the single comparison
 * below: one claim in the bearer token against one constant.
 */
export async function GET(request) {
  const theme = themes[config.theme];
  const { claims, user } = identity(request);

  const refuse = (reason) =>
    new Response(
      document_({
        theme,
        title: 'Not available',
        identity: user?.username ?? null,
        nav: config.nav,
        body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Administration</p>
        <h1>We cannot show you that page</h1>
        <div class="notice">${escapeHtml(reason)}</div>
        <p><a class="btn btn--ghost" href="/">Back to the overview</a></p>
      </div>
    </div>`,
      }),
      { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );

  if (!claims?.sub) return refuse('You need to sign in to reach this page.');
  if (claims.sub !== 'administrator') {
    return refuse(`This area is for administrators. The session you are holding belongs to "${claims.sub}".`);
  }

  const accounts = db()
    .prepare('SELECT username, display_name, clearance FROM users ORDER BY id')
    .all();

  return new Response(
    document_({
      theme,
      title: 'Administration',
      identity: 'administrator',
      nav: config.nav,
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Administration</p>
        <h1>Administration</h1>
        <p class="lede">Account management and trade pricing.</p>
        <div class="notice panel--accent">
          <strong>Trade pricing key</strong><br>
          <span class="token">${escapeHtml(flag(config.flagName))}</span>
        </div>
        <h2>Accounts</h2>
        <table>
          <tr><th>Username</th><th>Name</th><th>Clearance</th></tr>
          ${accounts
            .map(
              (a) =>
                `<tr><td>${escapeHtml(a.username)}</td><td>${escapeHtml(a.display_name)}</td><td>${escapeHtml(a.clearance)}</td></tr>`,
            )
            .join('')}
        </table>
      </div>
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
