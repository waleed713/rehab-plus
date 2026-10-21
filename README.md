# RehabPlus

Static front end (`public/`) plus a small serverless API (`functions/`, `server/`) for
Cloudflare Pages. Database: Supabase. Email: Resend. Chat assistant: Groq.

```
public/        the website (index, booking, contact, chat) + fonts, icons, config.js
functions/api/ /api/availability, /api/book, /api/contact, /api/chat
server/        shared server code (availability engine, validation, email, db)
supabase/      schema.sql (tables, row level security, seed data)
tests/         node --test suite for the API (no network needed)
```

## 1. One-time setup

**Supabase** (free tier is fine to start)
1. Create a project. Open *SQL Editor*, paste `supabase/schema.sql`, run it.
2. *Project Settings -> API*: copy the project URL and the **service_role** key.
   The service-role key is a secret: it only ever lives on the server.

**Resend**: add and verify your domain, create an API key, and make sure `EMAIL_FROM`
in `wrangler.toml` uses an address on that verified domain.

**Groq**: create an API key at console.groq.com. Do not paste it into chat, files or git.

**Clinic details**: edit `[vars]` in `wrangler.toml` (address, phone, email, hours, time
zone) and the same values in `public/config.js` (`clinic`). Social links are in
`clinic.social` in `config.js`; replace the placeholder profile URLs with your own.

## 2. Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # fill in the four secrets
npm run dev                        # http://localhost:8788
npm test                           # API tests
```

Opening the HTML files directly, or adding `?demo=1` to a URL, runs the pages in a
labelled demo mode with no server (nothing is sent or saved).

## 3. Deploy to Cloudflare Pages

```bash
npx wrangler login
npx wrangler pages project create rehabplus --production-branch main
npx wrangler pages secret put SUPABASE_URL --project-name rehabplus
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name rehabplus
npx wrangler pages secret put RESEND_API_KEY --project-name rehabplus
npx wrangler pages secret put GROQ_API_KEY --project-name rehabplus
npm run deploy
```

Then add your domain under *Pages -> Custom domains*. Hardening worth doing before launch:
in Cloudflare add a **rate limiting rule** for `/api/*` and enable **Turnstile** if you see
spam (the in-app rate limit is best-effort per server instance).

## 4. Day-to-day

| Task | Where |
|---|---|
| See / change appointments | Supabase *Table editor -> appointments* (set `status` to `confirmed` or `cancelled`; a cancelled slot becomes bookable again) |
| Change a doctor's weekly hours | table `availability_rules` |
| Block holidays or leave | table `time_off` (leave `doctor_id` empty to close the whole clinic) |
| Read contact-form messages | table `contact_messages` |
| Require manual approval | set `AUTO_CONFIRM = "false"` in `wrangler.toml`; bookings then stay `pending` and the patient is told it is not confirmed yet |
| Human chat hand-off | set `humanChatUrl` in `config.js` (a `https://wa.me/<number>` link, Crisp, Tawk.to, ...). Until then the button says no agent is connected |

How availability works: weekly rules, minus time off, minus pending/confirmed
appointments, computed in the clinic time zone. A unique database index on
(doctor, start time) makes double-booking impossible even when two people click at once.
The site only says "confirmed" after the database insert succeeded and the server answered.

## 5. Before you go live: replace the sample content

Phone (0321 5459190) and email (wa6901258@gmail.com) are set in `config.js` and `wrangler.toml`;
booking and contact emails are delivered to that email address. Still sample content: the four practitioner profiles and
photos, the three testimonials, the statistics (15+, 50K+, 98%, 12), and the privacy text.
Replace them with real, verified ones, then set `showSampleNotes: false` in `config.js`.
Health information is regulated (for example HIPAA in the US, GDPR in the EU/UK); have a
qualified professional review the privacy policy and vendor agreements.

## 6. Credits

Photos are hotlinked from Unsplash (free licence). The story video is "Physical Therapy"
by Mayo Clinic, embedded from YouTube; replace `storyVideo.id` in `config.js` with your
own clinic video. Fonts: Ivy Mode (headings, licensed by you) and Inter (body, SIL OFL).
Icons: Font Awesome Free 7 (self-hosted).
