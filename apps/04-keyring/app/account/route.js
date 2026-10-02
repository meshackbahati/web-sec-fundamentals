import { identity } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

export async function GET(request) {
  const { claims, user } = identity(request);

  if (!user) {
    return new Response(null, { status: 302, headers: { location: '/login' } });
  }

  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Your account',
      identity: user.username,
      nav: config.nav,
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Account</p>
        <h1>Your account</h1>
        <p class="lede">Signed in as ${escapeHtml(claims.sub)}.</p>
        <div class="panel">
          <table>
            <tr><th>Name</th><td>${escapeHtml(user.display_name)}</td></tr>
            <tr><th>Clearance</th><td>${escapeHtml(user.clearance)}</td></tr>
            <tr><th>Trade pricing</th><td>${user.clearance === 'full' ? 'Applied' : 'Not yet available'}</td></tr>
          </table>
        </div>
      </div>
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
