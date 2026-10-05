/**
 * Jakarta calendar-day keys — the one home for the app's day convention,
 * shared by client and server tiers (star calendar, streaks
 * lastCompletedDate, parent dashboard). Days are calendar dates in
 * Asia/Jakarta (the app's audience), stored and compared as "YYYY-MM-DD".
 */

/**
 * Calendar-day key in Asia/Jakarta (WIB, UTC+7, no DST) as "YYYY-MM-DD".
 */
export function dayKeyJakarta(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Today's "YYYY-MM-DD" in Asia/Jakarta. */
export function todayKeyJakarta(now: Date = new Date()): string {
  return dayKeyJakarta(now);
}

/** Last n calendar-day keys ending today (oldest first), Asia/Jakarta. */
export function lastDayKeysJakarta(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dayKeyJakarta(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}
