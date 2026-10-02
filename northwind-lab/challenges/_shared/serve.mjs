/**
 * Local harness for the challenges.
 *
 * It mounts the same handler modules Vercel mounts, so behaviour observed
 * during rehearsal is the behaviour that occurs in the deployed platform.
 * The only difference is plumbing: Vercel supplies the Request, this builds
 * one from a Node socket.
 *
 * Usage: CHALLENGE=01-jwt-forgery PORT=8801 node _shared/serve.mjs
 */

import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const challenge = process.env.CHALLENGE ?? '01-jwt-forgery';
const apiDir = path.resolve(here, '..', challenge, 'api');
const port = Number(process.env.PORT ?? 8801);

if (!existsSync(apiDir)) {
  console.error(`no such challenge: ${challenge} (looked in ${apiDir})`);
  process.exit(1);
}

// Each route file is named for the path it serves. index.js serves the root.
const handlers = new Map();
for (const entry of await readdir(apiDir)) {
  if (!entry.endsWith('.js')) continue;
  const mod = await import(path.join(apiDir, entry));
  const route = entry === 'index.js' ? '/' : `/${entry.replace(/\.js$/, '')}`;
  // Vercel dispatches on named HTTP method exports, so the harness must too.
  handlers.set(route, mod);
}

function resolve(pathname) {
  // Accept both the clean path and the /api path Vercel exposes, so one
  // solve script works against either host.
  const clean = pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return handlers.get(clean);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const mod = resolve(url.pathname);

  if (!mod) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>404</title><h1>404 Not Found</h1>');
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  // Hop-by-hop and length headers are recalculated by the runtime, so they
  // are dropped before constructing the Request.
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const name = key.toLowerCase();
    if (name === 'host' || name === 'content-length' || name === 'transfer-encoding') continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }

  const method = req.method ?? 'GET';
  const request = new Request(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });

  try {
    const handler = mod[method] ?? mod.default;
    if (!handler) {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`405 ${method} is not supported on ${url.pathname}`);
      return;
    }

    const response = await handler(request);
    const out = {};
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === 'set-cookie') continue;
      out[key] = value;
    }
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length) out['set-cookie'] = setCookies;

    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`500 ${error.stack ?? error.message}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[${challenge}] listening on http://127.0.0.1:${port}`);
});