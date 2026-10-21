import { HttpError, json, methodNotAllowed, rateLimit, route } from '../../server/http.js';
import { sb, q } from '../../server/db.js';
import { slotsForWindow, settings } from '../../server/availability.js';
import { DEFAULT_CLINIC_TZ, isValidTimeZone, parseDateKey, zonedToUtc } from '../../server/time.js';
import { validId } from '../../server/validate.js';

// GET /api/availability?doctorId=&serviceId=&date=YYYY-MM-DD&tz=<IANA>
export const onRequestGet = route(async ({ request, env }) => {
  rateLimit(request, 'availability', 90);
  const url = new URL(request.url);
  const doctorId = validId(url.searchParams.get('doctorId'), 'doctor');
  const serviceId = validId(url.searchParams.get('serviceId'), 'service');
  const day = parseDateKey(url.searchParams.get('date'));
  const tz = url.searchParams.get('tz') || '';
  if (!day) throw new HttpError(422, 'Invalid date');
  if (!isValidTimeZone(tz)) throw new HttpError(422, 'Invalid time zone');

  const windowStart = zonedToUtc(day.y, day.m, day.d, 0, 0, tz);
  const windowEnd = zonedToUtc(day.y, day.m, day.d + 1, 0, 0, tz);
  const { horizonMs } = settings(env);
  const now = Date.now();
  if (windowEnd.getTime() < now - 86_400_000 || windowStart.getTime() > now + horizonMs + 86_400_000) {
    return json({ slots: [] });
  }

  const [doctor] = (await sb(env, `doctors?id=eq.${q(doctorId)}&active=eq.true&select=id`)) || [];
  if (!doctor) throw new HttpError(404, 'Practitioner not found');
  const [link] = (await sb(env, `doctor_services?doctor_id=eq.${q(doctorId)}&service_id=eq.${q(serviceId)}&select=doctor_id`)) || [];
  if (!link) throw new HttpError(404, 'That practitioner does not offer this service');

  const slots = await slotsForWindow(env, doctorId, env.CLINIC_TZ || DEFAULT_CLINIC_TZ, windowStart, windowEnd);
  return json({ slots });
});

export const onRequest = methodNotAllowed;
