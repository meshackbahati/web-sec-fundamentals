import { storefront, issueToken, page, redirect, sessionCookie, escapeHtml } from './_lib.js';

const db = storefront();

function form(error) {
  return `<h1>Sign in</h1>
    ${error ? `<div class="banner">${escapeHtml(error)}</div>` : '<p class="lede">Access your trade account.</p>'}
    <form method="post" action="/login">
      <div class="field"><label for="u">Email or username</label><input id="u" name="username" type="text" autocomplete="username"></div>
      <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password"></div>
      <button type="submit">Sign in</button>
    </form>`;
}

/**
 * Vercel requires a named export per HTTP method. A default export that
 * returns a Response is discarded by the runtime, which then waits for a
 * Node-style response that never arrives and the invocation times out.
 */
export function GET(request) {
  return page(request, { title: 'Sign in', identity: null, body: form(null) });
}

export async function POST(request) {
  const submitted = await request.formData();
  const username = String(submitted.get('username') ?? '');
  const password = String(submitted.get('password') ?? '');

  const user = db
    .prepare('SELECT username FROM users WHERE username = ? AND password = ?')
    .get(username, password);

  if (!user) {
    return page(request, {
      title: 'Sign in',
      identity: null,
      body: form('That username and password did not match an account.'),
    });
  }

  return redirect('/account', {
    'set-cookie': sessionCookie(issueToken({ sub: user.username }), request),
  });
}
