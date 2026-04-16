/** Calendar YYYY-MM-DD in a specific IANA time zone (e.g. Asia/Kolkata). */
export function calendarYmdInTimeZone(timeZone: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayIstYmd(): string {
  return calendarYmdInTimeZone('Asia/Kolkata');
}

export function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}
