// Shared HTTP helpers for the Pages Functions (Cloudflare Workers runtime, Web-standard APIs only).

const MAX_BODY = 20_000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export const fail = (status, message) => json({ error: message }, status);

export async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "Request too large");
  let value;
  try {
    value = JSON.parse(text);
  } catch (_) {
    throw new HttpError(400, "Invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Invalid JSON");
  return value;
}

/** Browsers always send Origin on cross-origin POSTs; reject anything that is not this site. */
export function checkOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = [
    new URL(request.url).origin,
    ...String(env.ALLOWED_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  if (!allowed.includes(origin)) throw new HttpError(403, "Origin not allowed");
}

// Best-effort per-isolate limiter. For hard limits add a Cloudflare rate-limiting rule on /api/* (see README).
const buckets = new Map();
export function rateLimit(request, name, limit, windowMs = 60_000) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  const key = name + ":" + ip;
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit)
    throw new HttpError(
      429,
      "Too many requests. Please try again in a minute.",
    );
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets)
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  }
}

/** Wrap a handler so thrown HttpErrors become clean JSON responses and nothing else leaks. */
export function route(handler) {
  return async (context) => {
    try {
      return await handler(context);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      console.error("Unhandled error:", err && err.stack ? err.stack : err);
      return fail(500, "Something went wrong. Please try again.");
    }
  };
}

export const methodNotAllowed = () => fail(405, "Method not allowed");
