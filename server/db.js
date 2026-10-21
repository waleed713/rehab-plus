// Minimal Supabase (PostgREST) client using fetch and the service-role key.
// The service-role key bypasses Row Level Security: it must only ever live in server env vars.
import { HttpError } from "./http.js";

export async function sb(env, path, { method = "GET", body, prefer } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, "This service is not configured yet.");
  }
  const res = await fetch(
    env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path,
    {
      method,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = new Error(
      "Database error " +
        res.status +
        ": " +
        (data && data.message ? data.message : text.slice(0, 200)),
    );
    err.status = res.status;
    err.code = data && data.code;
    err.detail = data;
    throw err;
  }
  return data;
}

export const q = encodeURIComponent;

export function isUniqueViolation(err) {
  return Boolean(err) && (err.code === "23505" || err.status === 409);
}
