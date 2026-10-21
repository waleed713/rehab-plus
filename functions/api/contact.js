import { HttpError, checkOrigin, json, methodNotAllowed, rateLimit, readJson, route } from '../../server/http.js';
import { sb } from '../../server/db.js';
import { validateContact } from '../../server/validate.js';
import { sendContactEmail } from '../../server/email.js';

// POST /api/contact
export const onRequestPost = route(async ({ request, env }) => {
  checkOrigin(request, env);
  rateLimit(request, 'contact', 5);
  const body = await readJson(request);
  if (body.website) return json({ ok: true }); // honeypot

  const msg = validateContact(body);

  let stored = false;
  try {
    await sb(env, 'contact_messages', { method: 'POST', body: { ...msg, consent_at: new Date().toISOString() } });
    stored = true;
  } catch (err) {
    console.error('Could not store contact message:', err && err.message);
  }
  const emailed = await sendContactEmail(env, msg);

  // Succeed if the message reached at least one place a human will see it.
  if (!stored && !emailed) throw new HttpError(502, 'We could not send your message. Please try again or contact us directly.');
  return json({ ok: true });
});

export const onRequest = methodNotAllowed;
