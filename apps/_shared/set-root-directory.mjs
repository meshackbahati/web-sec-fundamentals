#!/usr/bin/env node
/**
 * Point one Vercel project's Git integration at one application directory.
 *
 * Invoked by apps/deploy.sh with APP_SLUG, PROJECT_NAME and ROOT_DIR set. The
 * token is read from the Vercel CLI credential store and never appears on a
 * command line.
 *
 * Usage: APP_SLUG=01-session-forge PROJECT_NAME=northwind-01-session-forge \
 *        ROOT_DIR=apps/01-session-forge node apps/_shared/set-root-directory.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const { APP_SLUG, PROJECT_NAME, ROOT_DIR } = process.env;

if (!APP_SLUG || !PROJECT_NAME || !ROOT_DIR) {
  console.error('APP_SLUG, PROJECT_NAME and ROOT_DIR must all be set');
  process.exit(2);
}

const auth = JSON.parse(
  readFileSync(path.join(process.env.HOME, '.local/share/com.vercel.cli/auth.json'), 'utf8'),
);

async function api(method, endpoint, body) {
  const response = await fetch(`https://api.vercel.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { raw: text.slice(0, 160) } };
  }
}

const list = await api('GET', '/v9/projects?limit=100');
const project = list.body?.projects?.find((p) => p.name === PROJECT_NAME);

if (!project) {
  console.log(`${PROJECT_NAME}: project not found yet, skipping root directory`);
  process.exit(0);
}

// The framework must be declared as well as the root directory. A project
// created before its root directory was set is classified as a static site,
// and a later build then fails looking for a "public" output directory that a
// Next.js application never produces.
if (project.rootDirectory === ROOT_DIR && project.framework === 'nextjs') {
  console.log(`${PROJECT_NAME}: already scoped to ${ROOT_DIR} (nextjs)`);
  process.exit(0);
}

const result = await api('PATCH', `/v9/projects/${project.id}`, {
  rootDirectory: ROOT_DIR,
  framework: 'nextjs',
});

if (result.status >= 200 && result.status < 300) {
  console.log(
    `${PROJECT_NAME}: ${project.rootDirectory ?? '(unset)'} [${project.framework ?? 'none'}] -> ${ROOT_DIR} [nextjs]`,
  );
} else {
  console.log(`${PROJECT_NAME}: FAILED (${result.status}) ${JSON.stringify(result.body).slice(0, 140)}`);
  process.exit(1);
}