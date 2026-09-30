/** Format stored local wall-clock values without a timezone conversion. */
export function formatLocalTime(value: string, dayOffset = 0): string {
  const [hours, minutes] = value.split(":").map(Number);
  const clock = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  return dayOffset ? `${clock} (next day)` : clock;
}
