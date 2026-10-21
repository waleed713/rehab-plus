// Availability engine: weekly rules - time off - existing appointments, computed in the clinic's time zone.
import { sb, q } from "./db.js";
import { zonedToUtc } from "./time.js";

const DAY = 86_400_000;

export function settings(env) {
  return {
    leadMs: Math.max(0, Number(env.SLOT_LEAD_HOURS ?? 4)) * 3_600_000,
    horizonMs: Math.max(1, Number(env.BOOKING_WINDOW_DAYS ?? 90)) * DAY,
  };
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

/**
 * Pure slot generator.
 * rules:     [{ weekday 0-6 (Sun=0), start_time 'HH:MM[:SS]', end_time, slot_minutes }]
 * busy:      [{ start_at, end_at }]  existing pending/confirmed appointments
 * timeOff:   [{ start_at, end_at }]
 * Returns slots whose start lies in [windowStart, windowEnd), sorted, each flagged available or not.
 */
export function generateSlots({
  rules,
  clinicTz,
  windowStart,
  windowEnd,
  busy = [],
  timeOff = [],
  now = new Date(),
  leadMs = 0,
  horizonMs = 90 * DAY,
}) {
  const slots = new Map();
  const first = new Date(windowStart.getTime() - DAY);
  const days =
    Math.ceil((windowEnd.getTime() - windowStart.getTime()) / DAY) + 2;
  const blocked = [...busy, ...timeOff].map((b) => [
    new Date(b.start_at),
    new Date(b.end_at),
  ]);

  for (let i = 0; i < days; i++) {
    const day = new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        first.getUTCDate() + i,
      ),
    );
    const weekday = day.getUTCDay();
    for (const rule of rules.filter((r) => Number(r.weekday) === weekday)) {
      const [sh, sm] = String(rule.start_time).split(":").map(Number);
      const [eh, em] = String(rule.end_time).split(":").map(Number);
      const step = Number(rule.slot_minutes) || 60;
      for (let t = sh * 60 + sm; t + step <= eh * 60 + em; t += step) {
        const start = zonedToUtc(
          day.getUTCFullYear(),
          day.getUTCMonth() + 1,
          day.getUTCDate(),
          Math.floor(t / 60),
          t % 60,
          clinicTz,
        );
        if (start < windowStart || start >= windowEnd) continue;
        const end = new Date(start.getTime() + step * 60_000);
        const bookable =
          start.getTime() >= now.getTime() + leadMs &&
          start.getTime() <= now.getTime() + horizonMs &&
          !blocked.some(([bs, be]) => overlaps(start, end, bs, be));
        slots.set(start.toISOString(), {
          start: start.toISOString(),
          end: end.toISOString(),
          available: bookable,
        });
      }
    }
  }
  return [...slots.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Load rules / appointments / time off for a doctor and generate slots for the window. */
export async function slotsForWindow(
  env,
  doctorId,
  clinicTz,
  windowStart,
  windowEnd,
  now = new Date(),
) {
  const lo = new Date(windowStart.getTime() - DAY).toISOString();
  const hi = new Date(windowEnd.getTime() + DAY).toISOString();
  const [rules, busy, timeOff] = await Promise.all([
    sb(
      env,
      `availability_rules?doctor_id=eq.${q(doctorId)}&select=weekday,start_time,end_time,slot_minutes`,
    ),
    sb(
      env,
      `appointments?doctor_id=eq.${q(doctorId)}&status=in.(pending,confirmed)&start_at=gte.${q(lo)}&start_at=lt.${q(hi)}&select=start_at,end_at`,
    ),
    sb(
      env,
      `time_off?or=(doctor_id.eq.${q(doctorId)},doctor_id.is.null)&end_at=gt.${q(lo)}&start_at=lt.${q(hi)}&select=start_at,end_at`,
    ),
  ]);
  const { leadMs, horizonMs } = settings(env);
  return generateSlots({
    rules: rules || [],
    clinicTz,
    windowStart,
    windowEnd,
    busy: busy || [],
    timeOff: timeOff || [],
    now,
    leadMs,
    horizonMs,
  });
}
