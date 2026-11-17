// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
