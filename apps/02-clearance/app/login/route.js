import { db, issueToken, sessionCookie } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { themes, document_, escapeHtml } from '../../lib/ui.js';

function form(error) {
  return `
    <div class="narrow" style="padding-top:56px">
      <h1>Sign in</h1>
      ${error ? `<div class="notice">${escapeHtml(error)}</div>` : '<p class="lede">Access your trade account.</p>'}
      <form method="post" action="/login" class="panel">
        <div class="field">
          <label for="u">Email or username</label>
          <input id="u" name="username" type="text" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="p">Password</label>
          <input id="p" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button type="submit">Sign in</button>
      </form>
    </div>`;
}

export async function GET(request) {
  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Sign in',
      identity: null,
      nav: config.nav,
      body: form(null),
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function POST(request) {
  const submitted = await request.formData();
  const username = String(submitted.get('username') ?? '');
  const password = String(submitted.get('password') ?? '');

  const user = db()
    .prepare('SELECT username FROM users WHERE username = ? AND password = ?')
    .get(username, password);

  if (!user) {
    return new Response(
      document_({
        theme: themes[config.theme],
        title: 'Sign in',
        identity: null,
        nav: config.nav,
        body: form('That username and password did not match an account.'),
      }),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: {
      location: '/account',
      'set-cookie': sessionCookie(issueToken({ sub: user.username }), secure),
    },
  });
}
