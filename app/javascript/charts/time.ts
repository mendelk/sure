// Financial dates are calendar days, not browser-local instants. Use the same
// UTC timestamp for marks, axes, focus, and date-only navigation parameters.
export function utcDayTimestamp(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

export function utcDayDomain(start: number, end: number): [number, number] {
  const padding = start === end ? 43_200_000 : 0;
  return [start - padding, end + padding];
}
