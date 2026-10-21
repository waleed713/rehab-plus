// Time-zone helpers built on Intl only (no dependencies).

export const DEFAULT_CLINIC_TZ = "America/New_York";

export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

/** Offset (minutes) of `tz` from UTC at the instant `date`: positive east of UTC. */
export function tzOffsetMinutes(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** Convert a wall-clock time in `tz` (month is 1-12; overflowing days roll over) to a UTC Date. */
export function zonedToUtc(y, m, d, hh, mm, tz) {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let utc = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  const offAtUtc = tzOffsetMinutes(new Date(utc), tz);
  utc = naive - offAtUtc * 60000; // settle across DST edges
  return new Date(utc);
}

export function parseDateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  )
    return null;
  return { y, m: mo, d };
}

export function formatInTz(
  date,
  tz,
  opts = { dateStyle: "full", timeStyle: "short" },
) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(
    date,
  );
}
