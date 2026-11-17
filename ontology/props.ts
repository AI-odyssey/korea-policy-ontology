// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import type { PropertyDef } from './schema.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Check a bag of values against property definitions. Shared by the world validator
 * (stored objects) and the action runtime (call parameters).
 * typeOf resolves an id to its object type, or undefined when it does not exist.
 */
export function checkProps(
  defs: Record<string, PropertyDef>,
  values: Record<string, unknown>,
  typeOf: (id: string) => string | undefined,
  allowedExtra: readonly string[] = [],
): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(defs, key) && !allowedExtra.includes(key)) errors.push(`${key}: unknown property`);
  }
  for (const [key, def] of Object.entries(defs)) {
    const v = values[key];
    if (v === undefined) {
      if (def.required) errors.push(`${key}: required`);
      continue;
    }
    const err = checkValue(def, v, typeOf);
    if (err) errors.push(`${key}: ${err}`);
  }
  return errors;
}

function checkRef(def: PropertyDef, v: unknown, typeOf: (id: string) => string | undefined): string | undefined {
  if (typeof v !== 'string') return 'expected an id string';
  const t = typeOf(v);
  if (!t) return `'${v}' does not exist or is not accessible`;
  if (def.refTypes && !def.refTypes.includes(t)) return `'${v}' is a ${t}, expected ${def.refTypes.join('|')}`;
}

function checkValue(def: PropertyDef, v: unknown, typeOf: (id: string) => string | undefined): string | undefined {
  switch (def.type) {
    case 'string':
    case 'text':
      return typeof v === 'string' ? undefined : 'expected string';
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'expected number';
      if (def.min !== undefined && v < def.min) return `must be >= ${def.min}`;
      if (def.max !== undefined && v > def.max) return `must be <= ${def.max}`;
      return;
    case 'boolean':
      return typeof v === 'boolean' ? undefined : 'expected boolean';
    case 'date':
      return typeof v === 'string' && DATE.test(v) ? undefined : 'expected YYYY-MM-DD';
    case 'datetime':
      return typeof v === 'string' && DATETIME.test(v) ? undefined : 'expected ISO datetime';
    case 'enum':
      return typeof v === 'string' && def.values?.includes(v) ? undefined : `expected one of ${def.values?.join('|')}`;
    case 'string[]':
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? undefined : 'expected string[]';
    case 'ref':
      return checkRef(def, v, typeOf);
    case 'ref[]':
      if (!Array.isArray(v)) return 'expected id[]';
      for (const x of v) {
        const e = checkRef(def, x, typeOf);
        if (e) return e;
      }
      return;
    case 'json':
      return;
  }
}
