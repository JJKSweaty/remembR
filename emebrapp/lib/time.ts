/** Parse a 12-hour time string (e.g. "8:00 AM", "12:30 PM") into minutes since midnight. */
export function parseTimeToMinutes(timeStr: string): number {
  const [timePart, period] = timeStr.trim().split(" ");
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

/** Parse a 12-hour time string (e.g. "8:00 AM") into a Date for today at that time. */
export function parseTimeToDate(timeStr: string): Date {
  const mins = parseTimeToMinutes(timeStr);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(mins / 60), mins % 60);
}
