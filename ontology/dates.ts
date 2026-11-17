// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
// Dates are plain 'YYYY-MM-DD' strings so results never depend on the machine's time zone.
const DAY = 86_400_000;

export const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-19' (or a datetime) -> 'Nov 19'. */
export const monthDay = (d?: string): string => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}` : '');
