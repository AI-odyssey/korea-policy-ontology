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

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
/** Saturday or Sunday. Public holidays are not modelled. */
export const isWeekend = (d: string): boolean => dow(d) === 0 || dow(d) === 6;
/** The date moved back to the previous working day when it falls on a weekend. */
export const workdayOnOrBefore = (d: string): string => (dow(d) === 6 ? addDays(d, -1) : dow(d) === 0 ? addDays(d, -2) : d);
/** n working days before a date (n >= 0), skipping weekends. */
export function workdaysBefore(date: string, n: number): string {
  let d = workdayOnOrBefore(date);
  for (let left = n; left > 0; left--) d = workdayOnOrBefore(addDays(d, -1));
  return d;
}
/** The date moved forward to the next working day when it falls on a weekend (a notice period that ends on a weekend runs to Monday). */
export const workdayOnOrAfter = (d: string): string => (dow(d) === 6 ? addDays(d, 2) : dow(d) === 0 ? addDays(d, 1) : d);
