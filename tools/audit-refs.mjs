#!/usr/bin/env node
// Reference audit for the dashboards repo.  Run from the repo root:
//
//     node tools/audit-refs.mjs
//
// Exits non-zero if anything is broken, so it can gate a release.
//
// WHY THIS EXISTS
// Two files (loading-states.js, skeletons.css) were deleted by accident in an
// unrelated commit and nothing noticed for ~489 versions: 16 pages kept asking
// for a script that was gone, and the service worker's whole precache was
// silently dead because cache.addAll() is atomic. Nothing surfaced either one.
//
// IMPORTANT: this audits the REPO, not the live site. Cloudflare Pages answers
// a missing path with "200 text/html" (the SPA fallback), so curl against
// production cannot tell present from absent. Check the files on disk.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (f) => readFileSync(f, 'utf8');
const files = (ext) => readdirSync('.').filter((f) => f.endsWith(ext) && statSync(f).isFile());
const html = files('.html'), js = files('.js'), css = files('.css');

// Cloudflare serves /foo for foo.html, so treat both as present.
const present = (p) => {
  const c = p.split('?')[0].split('#')[0].replace(/^\//, '');
  return c === '' || c === '.' || existsSync(c) || existsSync(c + '.html');
};
const local = (p) =>
  p && !/^(https?:)?\/\//.test(p) && !/^(data:|blob:|mailto:|tel:|javascript:|#)/.test(p)
    && !p.includes('${');            // template literals are not paths

const problems = [];
const report = (label, bad, fmt = (x) => x) => {
  const n = bad.length;
  console.log(`${n ? 'FAIL' : ' ok '}  ${label}${n ? ` — ${n}` : ''}`);
  bad.forEach((b) => console.log('        ' + fmt(b)));
  if (n) problems.push(label);
};

// ---------------------------------------------------------------- assets
const refs = new Map();
const note = (p, src) => { if (local(p)) refs.set(p, (refs.get(p) || new Set()).add(src)); };

for (const f of html) {
  const s = read(f);
  for (const m of s.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)/g)) note(m[1], f);
  for (const m of s.matchAll(/<link[^>]+href\s*=\s*["']([^"']+)/g)) note(m[1], f);
  for (const m of s.matchAll(/<(?:img|source|video|audio)[^>]+src\s*=\s*["']([^"']+)/g)) note(m[1], f);
}
for (const f of css) for (const m of read(f).matchAll(/url\(\s*['"]?([^'")]+)/g)) note(m[1], f);
for (const f of js) for (const m of read(f).matchAll(/["'](\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]{2,5})["']/g)) note(m[1], f);

report('asset references', [...refs].filter(([p]) => !present(p)),
  ([p, s]) => `${p}  <- ${[...s].join(', ')}`);

// ---------------------------------------------------------------- links
const links = [];
for (const f of html)
  for (const m of read(f).matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/g))
    if (local(m[1]) && !present(m[1])) links.push(`${m[1]}  <- ${f}`);
report('page links', links);

// ---------------------------------------------------------------- registries
const hrefs = (f) => [...read(f).matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
const perms = hrefs('permissions.js'), nav = hrefs('nav-menu.js');
report('permissions.js PAGES', perms.filter((p) => !present(p)));
report('nav-menu.js items', nav.filter((p) => !present(p)));
report('home.html cards',
  [...read('home.html').matchAll(/href:\s*'([^']+\.html)'/g)].map((m) => m[1]).filter((p) => !present(p)));

// A picker entry with no PAGES entry is hidden by access-guard for everyone
// except admins, so the link exists but silently does nothing for most users.
report('picker entries missing from permissions.js',
  nav.filter((h) => !perms.includes(h)));

// ---------------------------------------------------------------- service worker
const sw = read('sw.js');
const pre = [...sw.matchAll(/'([^']+)'/g)].map((m) => m[1])
  .filter((p) => p.startsWith('/') && sw.indexOf(`'${p}'`) < sw.indexOf('];'));
report('sw.js PRECACHE', pre.filter((p) => !present(p)));

// addAll() is atomic: one 404 rejects the batch and caches NOTHING.
report('sw.js uses atomic cache.addAll',
  /cache\.addAll\(/.test(sw.replace(/\/\/[^\n]*/g, '')) ? ['use per-entry cache.add + Promise.allSettled'] : []);

// The Cache API refuses to store a redirected response, and this host
// 308s /foo.html -> /foo, so a .html precache entry can never be cached.
report('sw.js PRECACHE uses .html paths (host redirects them)',
  pre.filter((p) => p.endsWith('.html')));

// ---------------------------------------------------------------- verdict
console.log();
if (problems.length) {
  console.log(`${problems.length} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');
