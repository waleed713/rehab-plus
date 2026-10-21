// Adapter: runs the Cloudflare-style handlers in /functions/api on Vercel (Node runtime).
export function vercel(mod) {
  return async function handler(req, res) {
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(
      ",",
    )[0];
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = `${proto}://${host}${req.url}`;

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    const request = new Request(url, { method: req.method, headers, body });

    const fn =
      (req.method === "GET" && mod.onRequestGet) ||
      (req.method === "POST" && mod.onRequestPost) ||
      mod.onRequest;
    const response = await fn({ request, env: process.env });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
