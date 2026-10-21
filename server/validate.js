import { HttpError } from "./http.js";
import { isValidTimeZone } from "./time.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Trim, drop control characters (blocks header injection) and cap length. */
export function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}
const oneLine = (value, max) => clean(value, max).replace(/[\r\n\t]+/g, " ");

function need(cond, message) {
  if (!cond) throw new HttpError(422, message);
}

export function validId(value, label) {
  const v = String(value ?? "");
  need(ID.test(v), `Invalid ${label}`);
  return v;
}

export function validateBooking(b) {
  const p = b.patient && typeof b.patient === "object" ? b.patient : {};
  const start = new Date(b.start);
  need(
    typeof b.start === "string" && !Number.isNaN(start.getTime()),
    "Invalid appointment time",
  );
  need(b.consent === true, "Consent is required");
  need(
    ["in-person", "online"].includes(b.consultation),
    "Invalid consultation type",
  );
  need(isValidTimeZone(b.timezone), "Invalid time zone");
  const out = {
    serviceId: validId(b.serviceId, "service"),
    doctorId: validId(b.doctorId, "doctor"),
    start,
    timezone: b.timezone,
    consultation: b.consultation,
    patient: {
      name: oneLine(p.name, 100),
      email: oneLine(p.email, 254).toLowerCase(),
      phone: oneLine(p.phone, 30),
      country: oneLine(p.country, 80),
      concern: clean(p.concern, 1000),
    },
  };
  need(out.patient.name.length >= 2, "Please enter your name");
  need(EMAIL.test(out.patient.email), "Please enter a valid email address");
  const digits = out.patient.phone.replace(/\D/g, "");
  need(
    digits.length >= 6 &&
      digits.length <= 15 &&
      /^[\d\s()+.-]+$/.test(out.patient.phone),
    "Please enter a valid phone number",
  );
  need(out.patient.country.length >= 2, "Please select your country");
  need(
    out.patient.concern.length >= 10,
    "Please describe your concern (at least 10 characters)",
  );
  return out;
}

export function validateContact(b) {
  need(b.consent === true, "Consent is required");
  const out = {
    name: oneLine(b.name, 100),
    email: oneLine(b.email, 254).toLowerCase(),
    subject: oneLine(b.subject, 150),
    message: clean(b.message, 2000),
  };
  need(out.name.length >= 2, "Please enter your name");
  need(EMAIL.test(out.email), "Please enter a valid email address");
  need(out.subject.length >= 3, "Please enter a subject");
  need(
    out.message.length >= 10,
    "Please enter a message (at least 10 characters)",
  );
  return out;
}

export function validateChat(b) {
  need(Array.isArray(b.messages) && b.messages.length > 0, "No messages");
  const messages = b.messages
    .slice(-12)
    .map((m) => {
      need(
        m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
        "Invalid message",
      );
      return { role: m.role, content: clean(m.content, 500) };
    })
    .filter((m) => m.content);
  need(
    messages.length > 0 && messages[messages.length - 1].role === "user",
    "The last message must come from the user",
  );
  return messages;
}
