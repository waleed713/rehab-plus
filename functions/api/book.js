import {
  HttpError,
  checkOrigin,
  json,
  methodNotAllowed,
  rateLimit,
  readJson,
  route,
} from "../../server/http.js";
import { isUniqueViolation, q, sb } from "../../server/db.js";
import { slotsForWindow } from "../../server/availability.js";
import { DEFAULT_CLINIC_TZ } from "../../server/time.js";
import { validateBooking } from "../../server/validate.js";
import {
  sendClinicBookingEmail,
  sendPatientBookingEmail,
} from "../../server/email.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alike characters
function newReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return (
    "RP-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")
  );
}

// POST /api/book
export const onRequestPost = route(async ({ request, env }) => {
  checkOrigin(request, env);
  rateLimit(request, "book", 6);
  const body = await readJson(request);

  // Honeypot: real visitors never fill this hidden field. Pretend success, store nothing.
  if (body.website) return json({ status: "pending", reference: "RP-000000" });

  const input = validateBooking(body);
  const clinicTz = env.CLINIC_TZ || DEFAULT_CLINIC_TZ;

  const [doctor] =
    (await sb(
      env,
      `doctors?id=eq.${q(input.doctorId)}&active=eq.true&select=id,name,modes`,
    )) || [];
  if (!doctor) throw new HttpError(404, "Practitioner not found");
  const [service] =
    (await sb(
      env,
      `services?id=eq.${q(input.serviceId)}&active=eq.true&select=id,name`,
    )) || [];
  if (!service) throw new HttpError(404, "Service not found");
  const [link] =
    (await sb(
      env,
      `doctor_services?doctor_id=eq.${q(doctor.id)}&service_id=eq.${q(service.id)}&select=doctor_id`,
    )) || [];
  if (!link)
    throw new HttpError(422, "That practitioner does not offer this service");
  if (!(doctor.modes || []).includes(input.consultation))
    throw new HttpError(
      422,
      "That consultation type is not offered by this practitioner",
    );

  // Re-check the exact slot on the server: never trust the browser's idea of availability.
  const exact = new Date(input.start.getTime() + 1);
  const slots = await slotsForWindow(
    env,
    doctor.id,
    clinicTz,
    input.start,
    exact,
  );
  const slot = slots.find(
    (s) => new Date(s.start).getTime() === input.start.getTime(),
  );
  if (!slot || !slot.available)
    throw new HttpError(
      409,
      "That time is no longer available. Please choose another.",
    );

  const status =
    String(env.AUTO_CONFIRM).toLowerCase() === "false"
      ? "pending"
      : "confirmed";
  let appt = null;
  for (let attempt = 0; attempt < 3 && !appt; attempt++) {
    try {
      const rows = await sb(env, "appointments", {
        method: "POST",
        prefer: "return=representation",
        body: {
          reference: newReference(),
          service_id: service.id,
          doctor_id: doctor.id,
          start_at: slot.start,
          end_at: slot.end,
          status,
          consultation: input.consultation,
          patient_name: input.patient.name,
          patient_email: input.patient.email,
          patient_phone: input.patient.phone,
          patient_country: input.patient.country,
          concern: input.patient.concern,
          timezone: input.timezone,
          consent_at: new Date().toISOString(),
        },
      });
      appt = Array.isArray(rows) ? rows[0] : rows;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const msg = JSON.stringify(err.detail || "") + err.message;
      if (/reference/i.test(msg)) continue; // reference collision: retry with a new one
      throw new HttpError(
        409,
        "That time was just taken. Please choose another.",
      ); // slot unique index
    }
  }
  if (!appt)
    throw new HttpError(
      500,
      "Could not create the appointment. Please try again.",
    );

  // The appointment exists now. Emails are best-effort; a failure must not undo the booking.
  const ctx = { appt, serviceName: service.name, doctorName: doctor.name };
  await Promise.allSettled([
    sendPatientBookingEmail(env, ctx),
    sendClinicBookingEmail(env, ctx),
  ]);

  return json({ status: appt.status, reference: appt.reference });
});

export const onRequest = methodNotAllowed;
