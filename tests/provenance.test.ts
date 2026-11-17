// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Same header and file set as scripts/add-headers.mjs, which adds it.
const HEADER = 'Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology';
const SOURCE = /\.(ts|tsx|mjs|css)$/;
const headerFor = (file: string) => (file.endsWith('.css') ? `/* ${HEADER} */` : `// ${HEADER}`);
const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.claude', 'out']);
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  SKIP.has(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : SOURCE.test(e.name) ? [join(dir, e.name)] : []);

describe('provenance', () => {
  it('every source file starts with the copyright header', () => {
    const files = walk(root).map((f) => relative(root, f).replace(/\\/g, '/'));
    expect(files.length).toBeGreaterThan(40);
    expect(files.filter((f) => !readFileSync(join(root, f), 'utf8').startsWith(headerFor(f)))).toEqual([]);
  });
});
