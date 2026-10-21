// Transactional email through Resend (https://resend.com/docs/api-reference/emails/send-email).
import { formatInTz } from "./time.js";

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sendEmail(
  env,
  { to, subject, html, text, replyTo, attachments },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn("Email skipped: RESEND_API_KEY / EMAIL_FROM are not set.");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + env.RESEND_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        reply_to: replyTo,
        attachments,
      }),
    });
    if (!res.ok) {
      console.error(
        "Resend error",
        res.status,
        (await res.text().catch(() => "")).slice(0, 300),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend request failed", err && err.message);
    return false;
  }
}

const shell = (
  title,
  inner,
) => `<!doctype html><html><body style="margin:0;background:#F5F2E9;font-family:Arial,Helvetica,sans-serif;color:#0B1A16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #dcdad0">
<tr><td style="background:#071D18;color:#F5F2E9;padding:22px 28px;font-size:20px;letter-spacing:.2px">RehabPlus</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;font-weight:600">${esc(title)}</h1>${inner}</td></tr>
<tr><td style="padding:18px 28px;background:#F5F2E9;font-size:12px;color:#536057">This message was sent by RehabPlus. Please do not reply with sensitive medical information.</td></tr>
</table></td></tr></table></body></html>`;

const rows = (pairs) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dcdad0;margin:16px 0">${pairs
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 14px;border-bottom:1px solid #eceae0;color:#536057;width:34%;font-size:14px">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #eceae0;font-size:14px">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;

function icsEscape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
const icsDate = (d) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildIcs({
  reference,
  start,
  end,
  summary,
  location,
  description,
}) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RehabPlus//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${reference}@rehabplus`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function clinicInfo(env) {
  return {
    name: env.CLINIC_NAME || "RehabPlus",
    address: env.CLINIC_ADDRESS || "",
    phone: env.CLINIC_PHONE || "",
    email: env.CLINIC_EMAIL || "",
  };
}

/** Email to the patient. Contains no description of the medical concern. */
export async function sendPatientBookingEmail(
  env,
  { appt, serviceName, doctorName },
) {
  const clinic = clinicInfo(env);
  const confirmed = appt.status === "confirmed";
  const when = formatInTz(new Date(appt.start_at), appt.timezone);
  const subject = confirmed
    ? `Your RehabPlus appointment is confirmed \u2014 ${when}`
    : `We received your appointment request \u2014 ${when}`;
  const lead = confirmed
    ? "Your appointment is confirmed. We look forward to seeing you."
    : "We have received your request. Your appointment is not confirmed until you hear back from us.";
  const details = [
    ["Reference", appt.reference],
    ["Service", serviceName],
    ["Practitioner", doctorName],
    ["When", `${when} (${appt.timezone.replace(/_/g, " ")})`],
    [
      "Type",
      appt.consultation === "online" ? "Online consultation" : "In person",
    ],
    [
      "Location",
      appt.consultation === "online"
        ? "Link will be sent before your session"
        : clinic.address,
    ],
  ];
  const contact = [clinic.phone, clinic.email].filter(Boolean).join(" \u00b7 ");
  const html = shell(
    confirmed ? "Appointment confirmed" : "Request received",
    `<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Hello ${esc(appt.patient_name)},</p><p style="font-size:15px;line-height:1.6;margin:0">${esc(lead)}</p>${rows(details)}<p style="font-size:14px;line-height:1.6;color:#536057">To reschedule or cancel, reply to this email${contact ? ` or contact us: ${esc(contact)}` : ""}. Quote your reference.</p>`,
  );
  const text = `${lead}\n\n${details
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(
      "\n",
    )}\n\nTo reschedule or cancel, reply to this email${contact ? ` or contact us: ${contact}` : ""}.`;
  const attachments = confirmed
    ? [
        {
          filename: "appointment.ics",
          content: toBase64(
            buildIcs({
              reference: appt.reference,
              start: appt.start_at,
              end: appt.end_at,
              summary: `${serviceName} \u2014 ${clinic.name}`,
              location:
                appt.consultation === "online" ? "Online" : clinic.address,
              description: `With ${doctorName}. Reference ${appt.reference}.`,
            }),
          ),
        },
      ]
    : undefined;
  return sendEmail(env, {
    to: appt.patient_email,
    subject,
    html,
    text,
    replyTo: clinic.email || undefined,
    attachments,
  });
}

/** Notification to the clinic inbox. Contains the full request, so keep this mailbox access-controlled. */
export async function sendClinicBookingEmail(
  env,
  { appt, serviceName, doctorName },
) {
  const to = env.CLINIC_EMAIL;
  if (!to) {
    console.warn("Clinic notification skipped: CLINIC_EMAIL is not set.");
    return false;
  }
  const clinicTz = env.CLINIC_TZ || "America/New_York";
  const details = [
    ["Reference", appt.reference],
    ["Status", appt.status],
    ["Service", serviceName],
    ["Practitioner", doctorName],
    ["Clinic time", formatInTz(new Date(appt.start_at), clinicTz)],
    [
      "Patient time",
      `${formatInTz(new Date(appt.start_at), appt.timezone)} (${appt.timezone})`,
    ],
    ["Type", appt.consultation],
    ["Patient", appt.patient_name],
    ["Email", appt.patient_email],
    ["Phone", appt.patient_phone],
    ["Country", appt.patient_country],
    ["Concern", appt.concern],
  ];
  const subject = `New appointment ${appt.status}: ${appt.patient_name} \u2014 ${formatInTz(new Date(appt.start_at), clinicTz)}`;
  return sendEmail(env, {
    to,
    subject,
    replyTo: appt.patient_email,
    html: shell("New appointment", rows(details)),
    text: details
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  });
}

export async function sendContactEmail(env, { name, email, subject, message }) {
  const to = env.CLINIC_EMAIL;
  if (!to) {
    console.warn("Contact email skipped: CLINIC_EMAIL is not set.");
    return false;
  }
  return sendEmail(env, {
    to,
    subject: `Website message: ${subject}`,
    replyTo: email,
    html: shell(
      "New website message",
      rows([
        ["From", name],
        ["Email", email],
        ["Subject", subject],
      ]) +
        `<p style="font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(message)}</p>`,
    ),
    text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
  });
}
