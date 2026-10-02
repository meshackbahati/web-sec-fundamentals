import { identityOf, json, flag } from './_lib.js';

/**
 * The settlement console. It has no interactive page and answers only
 * script-initiated requests from an authenticated administrator, so reading
 * it requires that script actually executed in an administrator's browser.
 */
export function GET(request) {
  const { claims } = identityOf(request);

  if (claims?.sub !== 'administrator') {
    return json({ error: 'administrator session required' }, 403);
  }
  if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return json({ error: 'this endpoint answers script-initiated requests only' }, 403);
  }

  return json({
    endpoint: '/console',
    operator: claims.sub,
    settlement_key: flag('FLAG_XSS'),
  });
}
