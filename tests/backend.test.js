// Run with: npm test   (Node 20+; no dependencies). Supabase, Resend and Groq are replaced by an in-memory fake.
import test from 'node:test';
import assert from 'node:assert/strict';

import { zonedToUtc, parseDateKey, isValidTimeZone } from '../server/time.js';
import { generateSlots } from '../server/availability.js';
import { onRequestGet as availabilityGet } from '../functions/api/availability.js';
import { onRequestPost as bookPost } from '../functions/api/book.js';
import { onRequestPost as contactPost } from '../functions/api/contact.js';
import { onRequestPost as chatPost } from '../functions/api/chat.js';

const ORIGIN = 'https://site.test';
const BASE_ENV = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk-secret',
  RESEND_API_KEY: 'rk-secret', EMAIL_FROM: 'RehabPlus <bookings@example.com>', CLINIC_EMAIL: 'clinic@example.com',
  CLINIC_TZ: 'America/New_York', CLINIC_ADDRESS: '1 Test St', CLINIC_PHONE: '+1 555 0100', GROQ_API_KEY: 'gk-secret'
};

// ---------------------------------------------------------------- fake backends
function makeWorld({ resendOk = true, groq } = {}) {
  const world = {
    appts: [], contacts: [], emails: [], groqCalls: [], fetchHosts: [],
    doctors: { 'dr-1': { id: 'dr-1', name: 'Dr. Sarah Miller', modes: ['in-person', 'online'] }, 'dr-2': { id: 'dr-2', name: 'Dr. Daniel Ortiz', modes: ['in-person'] } },
    services: { orthopedic: { id: 'orthopedic', name: 'Orthopedic Therapy' } },
    links: new Set(['dr-1:orthopedic', 'dr-2:orthopedic']),
    rules: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, start_time: '09:00:00', end_time: '13:00:00', slot_minutes: 60 },
      { weekday, start_time: '14:00:00', end_time: '18:00:00', slot_minutes: 60 }])
  };
  const respond = (status, body) => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); world.fetchHosts.push(u.host);
    const method = init.method || 'GET';
    if (u.host === 'api.resend.com') {
      world.emails.push({ headers: init.headers, body: JSON.parse(init.body) });
      return resendOk ? respond(200, { id: 'e1' }) : respond(500, { message: 'boom' });
    }
    if (u.host === 'api.groq.com') {
      world.groqCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
      if (groq) return groq();
      return respond(200, { choices: [{ message: { content: 'You can book on our Book Appointment page.' } }] });
    }
    if (u.host === 'x.supabase.co') {
      const table = u.pathname.replace('/rest/v1/', ''); const sp = u.searchParams;
      const eq = (k) => (sp.get(k) || '').replace(/^eq\./, '');
      if (method === 'GET' && table === 'doctors') return respond(200, world.doctors[eq('id')] ? [world.doctors[eq('id')]] : []);
      if (method === 'GET' && table === 'services') return respond(200, world.services[eq('id')] ? [world.services[eq('id')]] : []);
      if (method === 'GET' && table === 'doctor_services') return respond(200, world.links.has(eq('doctor_id') + ':' + eq('service_id')) ? [{ doctor_id: eq('doctor_id') }] : []);
      if (method === 'GET' && table === 'availability_rules') return respond(200, world.rules);
      if (method === 'GET' && table === 'time_off') return respond(200, []);
      if (method === 'GET' && table === 'appointments') {
        const lo = sp.getAll('start_at').find((v) => v.startsWith('gte.')).slice(4); const hi = sp.getAll('start_at').find((v) => v.startsWith('lt.')).slice(3);
        return respond(200, world.appts.filter((a) => a.doctor_id === eq('doctor_id') && ['pending', 'confirmed'].includes(a.status) && a.start_at >= lo && a.start_at < hi).map(({ start_at, end_at }) => ({ start_at, end_at })));
      }
      if (method === 'POST' && table === 'appointments') {
        const row = JSON.parse(init.body);
        if (world.appts.some((a) => a.doctor_id === row.doctor_id && a.start_at === row.start_at && ['pending', 'confirmed'].includes(a.status))) {
          return respond(409, { code: '23505', message: 'duplicate key value violates unique constraint "appointments_doctor_slot_uniq"' });
        }
        world.appts.push(row); return respond(201, [row]);
      }
      if (method === 'POST' && table === 'contact_messages') { world.contacts.push(JSON.parse(init.body)); return respond(201, null); }
    }
    throw new Error('Unexpected fetch ' + method + ' ' + url);
  };
  return world;
}

let ipCounter = 0;
const req = (path, { method = 'POST', body, ip, origin = ORIGIN } = {}) => new Request(ORIGIN + path, {
  method,
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || `10.0.0.${++ipCounter}`, ...(origin ? { origin } : {}) },
  body: method === 'GET' ? undefined : JSON.stringify(body)
});

// next Monday at least 14 days ahead, as YYYY-MM-DD
function futureMonday() {
  const d = new Date(Date.now() + 14 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const goodBooking = (start, over = {}) => ({
  serviceId: 'orthopedic', doctorId: 'dr-1', start, timezone: 'Asia/Karachi', consultation: 'in-person', consent: true, website: '',
  patient: { name: 'Ayesha Khan', email: 'Ayesha@Example.com', phone: '+92 300 1234567', country: 'Pakistan', concern: 'Right knee pain after running' }, ...over
});
async function firstSlot(env, date = futureMonday(), tz = 'Asia/Karachi', doctorId = 'dr-1') {
  const res = await availabilityGet({ request: req(`/api/availability?doctorId=${doctorId}&serviceId=orthopedic&date=${date}&tz=${tz}`, { method: 'GET' }), env });
  assert.equal(res.status, 200);
  return (await res.json()).slots;
}

// ---------------------------------------------------------------- time + slot maths
test('zonedToUtc handles New York summer, winter and both DST edges', () => {
  assert.equal(zonedToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(zonedToUtc(2026, 1, 15, 9, 0, 'America/New_York').toISOString(), '2026-01-15T14:00:00.000Z');
  assert.equal(zonedToUtc(2026, 3, 8, 9, 0, 'America/New_York').toISOString(), '2026-03-08T13:00:00.000Z'); // spring forward day, 09:00 is EDT
  assert.equal(zonedToUtc(2026, 11, 1, 9, 0, 'America/New_York').toISOString(), '2026-11-01T14:00:00.000Z'); // fall back day, 09:00 is EST
  assert.equal(zonedToUtc(2026, 10, 26, 9, 0, 'Asia/Karachi').toISOString(), '2026-10-26T04:00:00.000Z');
});

test('date and time zone validation', () => {
  assert.deepEqual(parseDateKey('2026-02-28'), { y: 2026, m: 2, d: 28 });
  assert.equal(parseDateKey('2026-02-30'), null);
  assert.equal(parseDateKey('nope'), null);
  assert.ok(isValidTimeZone('Asia/Karachi'));
  assert.ok(!isValidTimeZone('Mars/Olympus'));
});

test('generateSlots: clinic hours, user-time-zone window, lead time and busy slots', () => {
  const rules = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, start_time: '09:00:00', end_time: '13:00:00', slot_minutes: 60 }, { weekday, start_time: '14:00:00', end_time: '18:00:00', slot_minutes: 60 }]);
  const now = new Date('2026-10-15T00:00:00Z');
  // A patient in Karachi asks for Monday 26 Oct (their local day = 25 Oct 19:00Z .. 26 Oct 19:00Z)
  const windowStart = zonedToUtc(2026, 10, 26, 0, 0, 'Asia/Karachi'); const windowEnd = zonedToUtc(2026, 10, 27, 0, 0, 'Asia/Karachi');
  const busy = [{ start_at: '2026-10-26T14:00:00.000Z', end_at: '2026-10-26T15:00:00.000Z' }];
  const slots = generateSlots({ rules, clinicTz: 'America/New_York', windowStart, windowEnd, busy, now, leadMs: 4 * 3600_000 });
  assert.deepEqual(slots.map((s) => s.start.slice(11, 16)), ['13:00', '14:00', '15:00', '16:00', '18:00']);
  assert.deepEqual(slots.map((s) => s.available), [true, false, true, true, true]);
  assert.equal(new Date(slots[0].end) - new Date(slots[0].start), 3600_000);
  // lead time: "now" 1h before the first slot makes it unavailable
  const soon = generateSlots({ rules, clinicTz: 'America/New_York', windowStart, windowEnd, now: new Date('2026-10-26T12:00:00Z'), leadMs: 4 * 3600_000 });
  assert.deepEqual(soon.map((s) => s.available), [false, false, false, true, true]); // a slot exactly at now+lead is bookable
});

// ---------------------------------------------------------------- availability endpoint
test('availability returns sorted slots and rejects bad input', async () => {
  makeWorld();
  const slots = await firstSlot(BASE_ENV);
  assert.ok(slots.length >= 4 && slots.length <= 9, 'got ' + slots.length); // 4 or 5 depending on US daylight saving
  assert.ok(slots.every((s, i) => i === 0 || slots[i - 1].start < s.start));
  const bad = await availabilityGet({ request: req('/api/availability?doctorId=dr-1&serviceId=orthopedic&date=2026-13-40&tz=Asia/Karachi', { method: 'GET' }), env: BASE_ENV });
  assert.equal(bad.status, 422);
  const badTz = await availabilityGet({ request: req('/api/availability?doctorId=dr-1&serviceId=orthopedic&date=2026-10-26&tz=Mars/X', { method: 'GET' }), env: BASE_ENV });
  assert.equal(badTz.status, 422);
  const unknown = await availabilityGet({ request: req(`/api/availability?doctorId=dr-9&serviceId=orthopedic&date=${futureMonday()}&tz=Asia/Karachi`, { method: 'GET' }), env: BASE_ENV });
  assert.equal(unknown.status, 404);
  const nolink = await availabilityGet({ request: req(`/api/availability?doctorId=dr-1&serviceId=tmj&date=${futureMonday()}&tz=Asia/Karachi`, { method: 'GET' }), env: BASE_ENV });
  assert.equal(nolink.status, 404);
});

test('availability fails cleanly when the database is not configured', async () => {
  makeWorld();
  const res = await availabilityGet({ request: req(`/api/availability?doctorId=dr-1&serviceId=orthopedic&date=${futureMonday()}&tz=UTC`, { method: 'GET' }), env: {} });
  assert.equal(res.status, 503);
});

// ---------------------------------------------------------------- booking
test('booking: stores the appointment, emails patient (with .ics, no health details) and clinic, blocks double booking', async () => {
  const world = makeWorld();
  const slots = await firstSlot(BASE_ENV);
  const slot = slots.find((s) => s.available);
  const res = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start) }), env: BASE_ENV });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.status, 'confirmed');
  assert.match(out.reference, /^RP-[A-Z2-9]{6}$/);
  assert.equal(world.appts.length, 1);
  assert.equal(world.appts[0].patient_email, 'ayesha@example.com');
  assert.equal(world.appts[0].start_at, slot.start);
  assert.equal(world.emails.length, 2);
  const [patient, clinic] = world.emails;
  assert.deepEqual(patient.body.to, ['ayesha@example.com']);
  assert.ok(patient.body.attachments && patient.body.attachments[0].filename === 'appointment.ics');
  assert.match(Buffer.from(patient.body.attachments[0].content, 'base64').toString(), /BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z/);
  assert.ok(!JSON.stringify(patient.body).includes('knee pain'), 'patient email must not repeat the health concern');
  assert.deepEqual(clinic.body.to, ['clinic@example.com']);
  assert.equal(clinic.body.reply_to, 'ayesha@example.com');
  assert.ok(clinic.body.text.includes('knee pain'));
  assert.equal(patient.headers.authorization, 'Bearer rk-secret');

  const again = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start) }), env: BASE_ENV });
  assert.equal(again.status, 409);
  assert.equal(world.appts.length, 1);
  const after = await firstSlot(BASE_ENV);
  assert.equal(after.find((s) => s.start === slot.start).available, false);
});

test('booking: the unique index is the last line of defence against a race', async () => {
  const world = makeWorld();
  const slot = (await firstSlot(BASE_ENV)).find((s) => s.available);
  // both requests pass the availability check before either inserts
  const [a, b] = await Promise.all([
    bookPost({ request: req('/api/book', { body: goodBooking(slot.start) }), env: BASE_ENV }),
    bookPost({ request: req('/api/book', { body: goodBooking(slot.start, { patient: { name: 'Bilal Ahmed', email: 'bilal@example.com', phone: '03001234567', country: 'Pakistan', concern: 'Lower back stiffness' } }) }), env: BASE_ENV })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(world.appts.length, 1);
});

test('booking: AUTO_CONFIRM=false creates a pending request and says so', async () => {
  const world = makeWorld();
  const slot = (await firstSlot(BASE_ENV)).find((s) => s.available);
  const res = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start) }), env: { ...BASE_ENV, AUTO_CONFIRM: 'false' } });
  assert.equal((await res.json()).status, 'pending');
  assert.equal(world.appts[0].status, 'pending');
  assert.ok(!world.emails[0].body.attachments, 'no calendar file until confirmed');
  assert.match(world.emails[0].body.subject, /received your appointment request/);
});

test('booking: validation, unknown or unavailable slots, wrong consultation type', async () => {
  const world = makeWorld();
  const slot = (await firstSlot(BASE_ENV)).find((s) => s.available);
  const cases = [
    [{ consent: false }, 422], [{ patient: { ...goodBooking(slot.start).patient, email: 'not-an-email' } }, 422],
    [{ patient: { ...goodBooking(slot.start).patient, phone: 'abc' } }, 422], [{ patient: { ...goodBooking(slot.start).patient, concern: 'short' } }, 422],
    [{ timezone: 'Mars/X' }, 422], [{ consultation: 'phone' }, 422], [{ start: 'tomorrow' }, 422],
    [{ doctorId: 'dr-2', consultation: 'online' }, 422],            // dr-2 is in-person only
    [{ start: '2020-01-06T14:00:00.000Z' }, 409],                   // in the past
    [{ start: new Date(new Date(slot.start).getTime() + 17 * 60_000).toISOString() }, 409], // not on a slot boundary
    [{ serviceId: 'tmj' }, 404], [{ doctorId: 'dr-9' }, 404]
  ];
  for (const [over, expected] of cases) {
    const res = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start, over) }), env: BASE_ENV });
    assert.equal(res.status, expected, JSON.stringify(over));
  }
  assert.equal(world.appts.length, 0);
});

test('booking: honeypot, origin check, rate limit and body size', async () => {
  const world = makeWorld();
  const slot = (await firstSlot(BASE_ENV)).find((s) => s.available);
  const bot = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start, { website: 'http://spam.example' }) }), env: BASE_ENV });
  assert.equal(bot.status, 200); assert.equal(world.appts.length, 0); assert.equal(world.emails.length, 0);

  const evil = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start), origin: 'https://evil.example' }), env: BASE_ENV });
  assert.equal(evil.status, 403);
  const allowed = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start, { website: 'x' }), origin: 'https://www.clinic.com' }), env: { ...BASE_ENV, ALLOWED_ORIGIN: 'https://www.clinic.com' } });
  assert.equal(allowed.status, 200);

  const huge = await bookPost({ request: req('/api/book', { body: { junk: 'x'.repeat(30_000) } }), env: BASE_ENV });
  assert.equal(huge.status, 413);

  const ip = '203.0.113.9'; let last;
  for (let i = 0; i < 7; i++) last = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start, { website: 'x' }), ip }), env: BASE_ENV });
  assert.equal(last.status, 429);
});

test('booking: an email outage does not undo a stored appointment', async () => {
  const world = makeWorld({ resendOk: false });
  const slot = (await firstSlot(BASE_ENV)).find((s) => s.available);
  const res = await bookPost({ request: req('/api/book', { body: goodBooking(slot.start) }), env: BASE_ENV });
  assert.equal(res.status, 200);
  assert.equal(world.appts.length, 1);
});

// ---------------------------------------------------------------- contact
test('contact: stores, emails the clinic with reply-to, honeypot and failure handling', async () => {
  const world = makeWorld();
  const body = { name: 'Sara', email: 'sara@example.com', subject: 'Parking?', message: 'Is there parking near the clinic?', consent: true, website: '' };
  const res = await contactPost({ request: req('/api/contact', { body }), env: BASE_ENV });
  assert.equal(res.status, 200);
  assert.equal(world.contacts.length, 1);
  assert.equal(world.emails[0].body.reply_to, 'sara@example.com');
  assert.equal((await contactPost({ request: req('/api/contact', { body: { ...body, consent: false } }), env: BASE_ENV })).status, 422);
  assert.equal((await contactPost({ request: req('/api/contact', { body: { ...body, email: 'x' } }), env: BASE_ENV })).status, 422);
  await contactPost({ request: req('/api/contact', { body: { ...body, website: 'bot' } }), env: BASE_ENV });
  assert.equal(world.contacts.length, 1);
  // header injection attempt is flattened to one line
  await contactPost({ request: req('/api/contact', { body: { ...body, subject: 'Hi\r\nBcc: evil@example.com' } }), env: BASE_ENV });
  assert.ok(!/[\r\n]/.test(world.emails.at(-1).body.subject));
  // nothing configured at all -> honest failure
  const broken = await contactPost({ request: req('/api/contact', { body }), env: {} });
  assert.equal(broken.status, 502);
});

// ---------------------------------------------------------------- chat
test('chat: calls Groq server-side with the secret key, keeps the key out of the response', async () => {
  const world = makeWorld();
  const res = await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'user', content: 'How do I book?' }] } }), env: BASE_ENV });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes('gk-secret'));
  assert.match(JSON.parse(text).reply, /Book Appointment/);
  const call = world.groqCalls[0];
  assert.equal(call.headers.authorization, 'Bearer gk-secret');
  assert.equal(call.body.model, 'llama-3.3-70b-versatile');
  assert.equal(call.body.messages[0].role, 'system');
  assert.match(call.body.messages[0].content, /not a doctor/i);
  assert.match(call.body.messages[0].content, /1 Test St/);
});

test('chat: emergencies never reach the model; bad input and outages are handled', async () => {
  const world = makeWorld();
  const em = await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'user', content: 'I have chest pain and cannot breathe' }] } }), env: BASE_ENV });
  assert.match((await em.json()).reply, /emergency services/i);
  assert.equal(world.groqCalls.length, 0);

  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'system', content: 'x' }] } }), env: BASE_ENV })).status, 422);
  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [] } }), env: BASE_ENV })).status, 422);
  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'assistant', content: 'hi' }] } }), env: BASE_ENV })).status, 422);
  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'user', content: 'hi' }] } }), env: { ...BASE_ENV, GROQ_API_KEY: '' } })).status, 503);

  makeWorld({ groq: () => new Response('{"error":"rate"}', { status: 429 }) });
  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'user', content: 'hi' }] } }), env: BASE_ENV })).status, 429);
  makeWorld({ groq: () => new Response('oops', { status: 500 }) });
  assert.equal((await chatPost({ request: req('/api/chat', { body: { messages: [{ role: 'user', content: 'hi' }] } }), env: BASE_ENV })).status, 502);
});

test('chat: only the last 12 messages are forwarded and long content is capped', async () => {
  const world = makeWorld();
  const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i + 'x'.repeat(700) }));
  messages.push({ role: 'user', content: 'final' });
  await chatPost({ request: req('/api/chat', { body: { messages } }), env: BASE_ENV });
  const sent = world.groqCalls[0].body.messages;
  assert.equal(sent.length, 13); // system + 12
  assert.ok(sent.slice(1).every((m) => m.content.length <= 500));
});
