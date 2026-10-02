import { identity, flag } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { jsonResponse } from '../../lib/store.js';

/**
 * The settlement console has no interactive page. It answers only
 * script-initiated requests from an authenticated administrator, so reading it
 * requires that script actually ran in an administrator's browser.
 */
export async function GET(request) {
  const { claims } = identity(request);

  if (claims?.sub !== 'administrator') {
    return jsonResponse({ error: 'administrator session required' }, 403);
  }
  if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return jsonResponse({ error: 'this endpoint answers script-initiated requests only' }, 403);
  }

  return jsonResponse({
    endpoint: '/console',
    operator: claims.sub,
    settlement_key: flag(config.flagName),
  });
}
