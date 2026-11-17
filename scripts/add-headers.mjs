// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Puts the copyright line at the top of every source file that lacks it. Existing first-line comments stay below it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const HEADER = 'Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology';
export const SOURCE = /\.(ts|tsx|mjs|css)$/;
export const headerFor = (file) => (file.endsWith('.css') ? `/* ${HEADER} */` : `// ${HEADER}`);

if (import.meta.main) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter((f) => SOURCE.test(f));
  let changed = 0;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (text.startsWith(headerFor(f))) continue;
    writeFileSync(f, `${headerFor(f)}\n${text}`);
    changed++;
  }
  console.log(`${changed} of ${files.length} source files given the header.`);
}
