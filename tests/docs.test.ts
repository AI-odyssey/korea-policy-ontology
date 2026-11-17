// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderOntologyDoc } from '../ontology/render-docs.ts';
import { ACTION_NAMES, LINK_TYPE_NAMES, OBJECT_TYPE_NAMES } from '../ontology/schema.ts';

const doc = readFileSync(new URL('../docs/ontology.md', import.meta.url), 'utf8');
const section = (title: string) => doc.split(/^## /m).find((s) => s.startsWith(title)) ?? '';
const names = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[1]);

describe('docs/ontology.md', () => {
  it('is the generated file (run npm run docs:ontology after changing schema.ts)', () => {
    expect(doc).toBe(renderOntologyDoc());
  });
  it('lists exactly the object types in schema.ts', () => {
    expect(names(section('Object types'), /^### `(\w+)`/gm)).toEqual(OBJECT_TYPE_NAMES);
  });
  it('lists exactly the action types in schema.ts', () => {
    expect(names(section('Action types'), /^### `(\w+)`/gm)).toEqual(ACTION_NAMES);
  });
  it('lists exactly the link types, and one permission row per action', () => {
    expect(names(section('Link types'), /^\| `(\w+)`/gm)).toEqual(LINK_TYPE_NAMES);
    expect(names(section('Permission matrix'), /^\| `(\w+)`/gm)).toEqual(ACTION_NAMES);
  });
});
