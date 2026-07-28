#!/usr/bin/env node
// Gate: public pages must stay anonymous-safe and fully declared.
//
// Agent-written pages under src/pages/public/ are served to visitors WITHOUT
// a LivingApps session. An import of the authenticated data layer
// (livingAppsService, useDashboardData, dialogs, …) compiles fine but dies
// with 401s for every real visitor — so '@/' imports are allowlisted here.
// And a page is only reachable/usable when registry.tsx and
// _public/surface.json agree: the registry routes it, the surface declares
// what the service must grant.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const PAGES_DIR = 'src/pages/public';
const SURFACE = '_public/surface.json';
const REGISTRY = join(PAGES_DIR, 'registry.tsx');
// Scaffold files — generator-owned, not subject to the page rules.
const SCAFFOLD = new Set(['PublicPage.tsx', 'PublicFormPage.tsx', 'registry.tsx']);

// The '@/' modules a public page may import. Everything else on '@/' is the
// authenticated dashboard side. Entries ending in '/' allow the subtree.
const ALLOWED_AT = [
  '@/lib/publicClient',
  '@/components/PublicShell',
  '@/components/blocks/',
  '@/components/ui/',
  '@/components/widgets/',
  '@/lib/utils',
  '@/lib/formatters',
  '@/types/',
];

const errors = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
  }
  return files;
}

// ── 1. Import allowlist over agent-written pages ─────────────────────────
const IMPORT_RE = /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;
const pageFiles = existsSync(PAGES_DIR)
  ? walk(PAGES_DIR).filter(f => !SCAFFOLD.has(basename(f)))
  : [];
for (const file of pageFiles) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (spec.startsWith('@/')) {
      const ok = ALLOWED_AT.some(a => spec === a || (a.endsWith('/') && spec.startsWith(a)));
      if (!ok) {
        errors.push(`${file}:${line}: '${spec}' is dashboard-side (needs a login) — public pages may import only: ${ALLOWED_AT.join(', ')}`);
      }
    } else if (spec.startsWith('..')) {
      errors.push(`${file}:${line}: relative import '${spec}' escapes ${PAGES_DIR} — use an allowlisted '@/' module or a sibling './' import`);
    }
  }
}

// ── 2. registry.tsx ↔ surface.json consistency ───────────────────────────
const registrySlugs = new Map(); // slug -> imported module name
if (existsSync(REGISTRY)) {
  const src = readFileSync(REGISTRY, 'utf8');
  const RE = /['"]([\w-]+)['"]\s*:\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/pages\/public\/([\w.-]+)['"]\s*\)\s*\)/g;
  let m;
  while ((m = RE.exec(src)) !== null) registrySlugs.set(m[1], m[2]);
}

let surface = null;
if (existsSync(SURFACE)) {
  try {
    surface = JSON.parse(readFileSync(SURFACE, 'utf8'));
  } catch (e) {
    errors.push(`${SURFACE}: invalid JSON — ${e.message}`);
  }
}
const surfacePages = new Map(((surface && surface.pages) || []).map(p => [p.slug, p]));

for (const [slug, module] of registrySlugs) {
  if (!surfacePages.has(slug)) {
    errors.push(`${REGISTRY}: slug '${slug}' is registered but ${SURFACE} declares no page for it — without the declaration the service grants nothing and the page renders "unavailable"`);
  }
  if (!existsSync(join(PAGES_DIR, `${module}.tsx`))) {
    errors.push(`${REGISTRY}: slug '${slug}' imports '@/pages/public/${module}' but ${PAGES_DIR}/${module}.tsx does not exist`);
  }
}
for (const [slug, page] of surfacePages) {
  if (page.component && !registrySlugs.has(slug)) {
    errors.push(`${SURFACE}: page '${slug}' declares component '${page.component}' but ${REGISTRY} has no entry for it — the component is unreachable`);
  }
  for (const ep of page.endpoints || []) {
    if (ep.scope && !ep.scope_description) {
      errors.push(`${SURFACE}: page '${slug}' endpoint '${ep.entity}' has a scope but no scope_description — the owner confirms that text when publishing, never the vSQL`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`check-public: OK (${pageFiles.length} pages, ${registrySlugs.size} registered slugs)`);
