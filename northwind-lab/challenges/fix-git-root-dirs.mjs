#!/usr/bin/env node
/**
 * Point each Vercel project's Git integration at its own challenge folder.
 *
 * Without this, every push to the repository triggers a build of the
 * repository root for all four projects. The root contains no top-level
 * `api/` directory, so those builds produce a site that 404s on every route
 * and, because they are newer, they take over each project's production
 * alias. The symptom is a target that worked and then stopped working with no
 * change to its own code.
 *
 * Setting rootDirectory per project makes each one genuinely standalone: a
 * push builds that challenge and nothing else.
 *
 * The token is read from the Vercel CLI's own credential store and is never
 * printed or passed on a command line.
 *
 * Usage: node fix-git-root-dirs.mjs [--check]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const CHALLENGES = {
  'northwind-01-jwt-forgery': 'northwind-lab/challenges/01-jwt-forgery',
  'northwind-02-sqli': 'northwind-lab/challenges/02-sqli',
  'northwind-03-xss': 'northwind-lab/challenges/03-xss',
  'northwind-04-jwt-kid-injection': 'northwind-lab/challenges/04-jwt-kid-injection',
};

const checkOnly = process.argv.includes('--check');

const auth = JSON.parse(
  readFileSync(path.join(process.env.HOME, '.local/share/com.vercel.cli/auth.json'), 'utf8'),
);
const token = auth.token;

async function api(method, endpoint, body) {
  const response = await fetch(`https://api.vercel.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

const { status: listStatus, body: projects } = await api(
  'GET',
  '/v9/projects?limit=100',
);

if (listStatus !== 200) {
  console.error('could not list projects:', projects);
  process.exit(1);
}

let changed = 0;
let problems = 0;

for (const [name, rootDirectory] of Object.entries(CHALLENGES)) {
  const project = projects.projects?.find((p) => p.name === name);
  if (!project) {
    console.log(`  ${name.padEnd(32)} MISSING from the account`);
    problems += 1;
    continue;
  }

  const current = project.rootDirectory ?? '(unset)';
  if (current === rootDirectory) {
    console.log(`  ${name.padEnd(32)} already set`);
    continue;
  }

  if (checkOnly) {
    console.log(`  ${name.padEnd(32)} ${current}  ->  would set ${rootDirectory}`);
    continue;
  }

  const result = await api('PATCH', `/v9/projects/${project.id}`, { rootDirectory });

  if (result.status >= 200 && result.status < 300) {
    console.log(`  ${name.padEnd(32)} ${current}  ->  ${rootDirectory}`);
    changed += 1;
  } else {
    console.log(`  ${name.padEnd(32)} FAILED (${result.status}) ${JSON.stringify(result.body).slice(0, 160)}`);
    problems += 1;
  }
}

console.log(
  `\n${checkOnly ? 'checked' : 'updated'} ${Object.keys(CHALLENGES).length} project(s): ` +
    `${changed} changed, ${problems} problem(s)`,
);
process.exit(problems ? 1 : 0);