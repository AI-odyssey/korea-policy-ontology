// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Polite HTTP: one request at a time per host with a pause between, a timeout, and retries on
// network errors, 429 and 5xx. The user agent names the project and nothing else.

export const USER_AGENT = 'korea-policy-ontology/0.1';
const PAUSE_MS = 437;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const queues = new Map<string, Promise<unknown>>();

function politely<T>(host: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(host) ?? Promise.resolve()).then(task, task);
  queues.set(host, run.then(() => sleep(PAUSE_MS), () => sleep(PAUSE_MS)));
  return run;
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export function fetchText(url: string, { timeoutMs = 25_000, retries = 2, headers = {}, method = 'GET', body }: FetchOptions = {}): Promise<string> {
  return politely(new URL(url).host, async () => {
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let error: unknown;
      try {
        res = await fetch(url, { method, body, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return await res.text();
      } catch (e) {
        error = e;
      }
      const retriable = !res || res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= retries) throw error ?? new Error(`HTTP ${res!.status} from ${new URL(url).host}`);
      await sleep(1000 * 2 ** attempt);
    }
  });
}

export const fetchJson = async <T = unknown>(url: string, opts?: FetchOptions): Promise<T> => JSON.parse(await fetchText(url, opts));
