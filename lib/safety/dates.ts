/** Date helpers for the judge. Pure: they never read the clock. */

/** The ISO date (YYYY-MM-DD) `months` months before `isoDate`. */
export function monthsBefore(isoDate: string, months: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** True when `registeredAt` is strictly less than `months` months before `asOf`. */
export function isYoungerThan(registeredAt: string, asOf: string, months: number): boolean {
  return registeredAt.slice(0, 10) > monthsBefore(asOf, months);
}
