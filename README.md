# Jio

*Jio* — Singlish, "to invite someone along."

A progressive web app for the daily question nobody wants to be the one to ask:
**where are we eating?** It learns what you actually like from what you rate,
runs a ranked-choice vote when a group has to agree, and stays out of the way
the rest of the time.

Runs on free tiers end to end. Works on a phone and on a desktop, and installs
to a home screen.

---

## Quick start

You need Node 18 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

That is the whole setup. With no configuration at all the app runs in **demo
mode**: an in-memory store with 22 places around Bras Basah and Bugis, two
invented teammates with opinions, a lunch group, and one Jio mid-vote. No
accounts, no keys, no database. Everything resets when the dev server restarts.

When you are ready to make it real, see [Going live](#going-live).

---

## What it does

| | |
|---|---|
| **Suggest** | Ranks places on what you rate highly, what fits your budget, how far it is, and how recently you were there. Every suggestion says *why* it is there. |
| **Jios** | Create a lunch outing, everyone ranks the options, a Borda count decides. RSVP, live vote updates, a roulette wheel for when the group genuinely cannot choose, and a month calendar with Hosting / Invited / Past filters for browsing. Anyone can edit a place, any signed-in user may edit any place's details, and the host can cancel a Jio outright — it stays visible, marked cancelled, rather than vanishing. Once a Jio is decided, its result — place, time, final points — can be copied or shared as a PNG, generated client-side, for pasting straight into a chat instead of a link. A host can also start a Jio with votes hidden: nobody, host included, sees the running standing until it closes — only the ballot count shows. Each option in the Standing and Your ranking lists shows a compact cuisine descriptor beneath its name, so a placeless or unfamiliar option still says something about what it is before anyone clicks in. |
| **Vote on a place that isn't listed yet** | Typing a name the search doesn't find logs it as a vote option immediately, no place record required. A non-blocking prompt afterward offers to add it to the pool; declining leaves it exactly as a text-only choice, permanently. |
| **Kakis** | Lunch groups with a shareable invite link and shared stats — group favourites, who eats out most, who is most adventurous. Any current member can also add someone directly by searching their name, without a link changing hands first — same trust level as the invite link itself, just faster for someone already sitting across the table. |
| **Lobangs** | "Saw this online, thought of you" — send any registered place to specific teammates or a whole Kaki, with an optional note and personalized "quick pick" suggestions. Two entry points side by side: from a closed Jio in "You → Past Jios" (the winning place pinned as a default), and directly from a place's own page (`/places/[id]`) for the more common case of just browsing and thinking of someone. A dedicated `/lobangs` page (linked from "See all" on the profile inbox) shows everything sent and received as one reverse-chronological, message-bubble feed — your own sends right-aligned, a group send showing the Kaki's name as the recipient. Browse only, deliberately: a lobang is a one-way tip, not a two-way conversation, so there's no reply. |
| **Places** | Searchable list with cuisine, budget, walk-time and rating filters, sortable by nearest, highest-rated, or rated by your Kaki group — plus a "Kaki favourites only" chip that actually narrows the list, not just reorders it, and a badge on the card itself once at least 2 Kaki-member visits back a place's rating, so a lone review doesn't read as group consensus. Add places by hand (address or postal code — a postal code found anywhere in a pasted-in address, e.g. one copied straight from Google Maps, is tried first, since OneMap's road/block index can choke on a business-name prefix or unit number that a bare postal code sidesteps), import candidate names from a food blog, or let the daily cron find them on OpenStreetMap. Cuisine tagging covers a fixed, scored list (now including Modern and Traditional) plus free-text "Other" tags that show on the place but never affect recommendations. A place's own page has a "View on Google Maps" link next to Directions. Without a Google Places API key configured it's a plain coordinate pin, computed client-side, no backend call — that's still the default. With one configured, the app resolves each place to its actual Google listing, best-effort, server-side, at create/edit time (gated on the result actually looking like the same place — name similarity plus a distance check — not just Google's own top result), and the link opens that instead: the restaurant's real page, photos and reviews included, with the coordinate link as an automatic fallback if the match ever stops resolving. Every active place also has a public preview page (`/p/[id]`, linked from a Share button on the full page) — the app's only page that needs no sign-in, showing name, cuisine, address, best dishes, aggregate rating and the same Maps link (real listing or pin, same rule) to anyone with the link, with a "Join to see more" prompt into `/login` for everything past that, including the named review list. |
| **Map** | Leaflet map of everything in walking distance, with real walking routes when OneMap is configured. A Kaki-favourite place gets an amber ring on its marker, layered independently of the existing selected/not-selected fill color. |
| **Reviews** | Log a visit privately, or share it as a review. Each visit is its own entry, editable and deletable later — including un-sharing a review back to private. Each shared review can be liked — a bare count plus your own toggle state, no "liked by" list — which nudges the reviewer with a throttled push (at most one per review per ~10 minutes) and feeds into a weekly recap push for anyone whose reviews got at least one like that week. |
| **Saved places** | Bookmark anywhere from any list. `/places` has an All / Saved split, and saving nudges a place up your own suggestions. |
| **Weather** | Checks the NEA two-hour forecast. When rain is likely, the walk penalty doubles and closer places quietly rise. |
| **Metrics** | What you actually eat versus what you think you eat, plus a nudge when you have had the same cuisine three days running. |
| **Home** | A quick-action dashboard, not a second Jios list: today's Jio becomes the headline when there is one; a capped list (next one or two) of what's coming up otherwise; "Same as last time?" one-tap repeat of your last hosted Jio. |
| **Recurring Jios** | A standing weekly Jio — same place every time (auto-confirmed, no vote needed) or a vote over the same option pool each week. Generates its next occurrence lazily, a few days ahead, when the host loads Home or Jios; invitees are expanded fresh from current kaki membership every time, not frozen at series creation. |
| **Push notifications** | Opt in from "You": get notified when you're invited to a Jio, when someone votes on one you're hosting (throttled to at most one push per event per ~10 minutes), when a Jio you're in is starting in 30 minutes and you haven't voted or RSVP'd, when one you're in gets decided, when someone likes a review you shared (same ~10 minute throttle, skipped for liking your own review), and a weekly recap of how many likes your reviews picked up, sent only if that count is above zero. iOS only ever delivers push to an installed PWA, never a browser tab, so the app also nudges toward "Add to Home Screen" after a few visits — dismissible with "remind me later," not a one-shot ask — plus an always-available "Add to home screen" card in "You" for anyone who dismissed that prompt but changes their mind later. In `name` mode, a successful install is also followed by an offer to attach an email, since installing the icon is the moment a second, independent signed-in context is about to exist. |
| **Admin** | Moderation (reports, block/unblock), an analytics dashboard (growth, Jio outcomes, top places, Kaki activity, moderation and wishlist trends, a same-day participation funnel), office management, and an accounts screen for merging duplicate identities (auto-surfaced by shared name, or search any account) and issuing recovery links — all reachable from "You", no dedicated nav icon, since admins are the one group that needs it least often. |

---

## How it is put together

The whole point of the structure is that you can replace any one piece without
touching the others.

```
src/
├── app/                 Next.js App Router — pages and API routes
├── components/          UI. Nothing here knows what a database is.
├── lib/
│   ├── config/          Which implementation backs each seam + feature flags
│   ├── data/            The Repo interface and its implementations
│   ├── auth/            The AuthAdapter interface and its implementations
│   ├── providers/       Routing, weather and discovery adapters
│   ├── supabase/        Supabase client factories
│   ├── recommend.ts     Scoring engine (pure)
│   ├── voting.ts        Borda count (pure)
│   ├── metrics.ts       Visit statistics (pure)
│   ├── blogImport.ts    Blog parsing + SSRF guard (pure)
│   └── discovery.ts     OSM normalisation + dedupe (pure)
└── types/               Domain types, storage-agnostic on purpose
```

### The seams

Everything swappable answers to an interface, and one factory picks the
implementation from an environment variable.

| Seam | Interface | Ships with | Set with |
|---|---|---|---|
| Database | `Repo` (`lib/data/index.ts`) | `demoRepo`, `supabaseRepo` | `JIO_DATA_ADAPTER` |
| Auth | `AuthAdapter` (`lib/auth/index.ts`) | `demoAuth`, `nameAuth`, `supabaseAuth` | `NEXT_PUBLIC_JIO_AUTH_ADAPTER` |
| Walking routes | `RoutingProvider` | OneMap, haversine | `JIO_ROUTING_PROVIDER` |
| Weather | `WeatherProvider` | NEA, none | `JIO_WEATHER_PROVIDER` |
| Place discovery | `DiscoveryProvider` | Overpass, none | `JIO_DISCOVERY_PROVIDER` |

**No page or API route imports a database client.** They call `getRepoAsync()`
and use the interface. That is what makes the next section a small job rather
than a rewrite.

### Moving to a different database

1. Write `src/lib/data/myRepo.ts` implementing the `Repo` interface.
2. Add `"mydb"` to the `DataAdapter` union in `src/lib/config/index.ts`.
3. Add a case to the switch in `src/lib/data/repo.ts`.

That is it. `tests/repoConformance.test.ts` will fail loudly if you miss a
method or change an arity, so a half-finished port cannot ship quietly.

The same three steps apply to auth, routing, weather and discovery.

### Feature flags

Every optional slice can be switched off without deleting code. Disabling one
hides its navigation entry *and* makes its API routes return 404 — so a
stripped build has no half-live endpoints.

```bash
NEXT_PUBLIC_JIO_DISABLED_FEATURES=kakis,blogImport,roulette
```

Valid keys: `events`, `kakis`, `wishlist`, `lobangs`, `blogImport`, `discovery`,
`weather`, `map`, `metrics`, `roulette`, `reviews`, `offices`.

---

## Accounts

Three modes, set by `NEXT_PUBLIC_JIO_AUTH_ADAPTER`. **`name` is the default.**

### `name` — type your name, that's it

One field, one button, you're in. No email, no password, no provider to
configure, nothing to verify. You get a distinct user with a real UUID, so
votes, reviews and recommendations are all properly attributed and everyone can
tell who is who.

The sign-in screen is the *only* screen a new user sees — it stamps
`profiles.onboarded_at` itself, so the `/welcome` onboarding step never fires
in this mode. Asking for a name and then asking again to confirm it was one
question too many. `/welcome` still exists for `email` mode, where people
genuinely arrive without having given a name.

Underneath it is a Supabase **anonymous session**. That detail matters: the
obvious shortcut — a signed cookie holding a user id we made up — would mean no
`auth.uid()`, which would mean every Row Level Security policy in the schema
stops working and every query has to run as service role. Anonymous sessions
give a real row in `auth.users` and a JWT with the `authenticated` role, so
every migration's worth of access control keeps applying exactly as written.
Zero sign-up friction, security model intact.

Two things you are accepting in exchange:

- **Identity is bound to the browser session.** Clear site data — or just lose
  the session some other way — and you land on a fresh one with no history.
  Your phone is a different user from your laptop. Recoverable, see below.
- **Anyone can claim any name.** There is no secret, so nothing stops someone
  typing a colleague's name. Fine for a team that already trusts each other —
  and while it lasts, it's also the recovery mechanism (next paragraph).

**Recovering a lost identity** doesn't require the session-storage fix to be
perfect — two independent paths exist regardless of what caused the loss.
Typing your name again offers to resolve to your *existing* profile rather
than forking a new one, if a different, case/whitespace-normalized-matching
profile already exists (`nameAuth.signInWithName`, CHANGES_20260807.md §4) —
same "anyone can claim any name" trade-off as above, just now actually
useful instead of a landmine. **Offers**, not merges silently:
CHANGES_20260807c.md §3 added a confirmation step first — "an account named
'X' already exists, is this you?" — since the earlier silent version caught
the deliberate-impersonation case fine but not the accidental one (a typo,
or two different real people who happen to share a first name). Answering
"no, different person" signs in as a distinct account under the same name
and pushes a notification to every admin, since that's a confirmed real
duplicate, not a maybe. Whether typing a name can auto-merge at all is a
manual switch — `JIO_NAME_CLAIM_ENABLED=false` turns it off once names
genuinely aren't unique across the team anymore (decided to be a manual
call, not an automatic team-size trigger — the confirmation step already
catches the accidental case that made an automatic trigger feel urgent).

That stops being safe the moment two different real people can share a
name, which is where **recovery links** come in: an unguessable, per-account
token (get one from "You" while still signed in — nudged after a few visits
if you haven't, same dismissible pattern as the install prompt below, since
you can't generate one for an account you've already lost — or an admin
issues one from `/admin/accounts` for someone already locked out) that
redeems at `/recover/<token>` with zero name-matching involved —
collision-proof by construction, and built independently of the name-claim
code path specifically so it keeps working unmodified once
`JIO_NAME_CLAIM_ENABLED` is turned off. Both funnel into the same
reassignment operation an admin can also trigger directly from
`/admin/accounts` — pick the account to keep, pick the stale one(s) to fold
in, preview what moves, confirm.

**One real trap in `name` mode worth knowing about explicitly: a browser tab
and a home-screen icon are genuinely separate storage contexts on iOS, each
capable of holding its own signed-in session.** Confirming a name-match
claim always deletes the matched account, which is exactly right when it's
a genuinely abandoned duplicate — but if that account is actually the
*other* context's live session (both tab and icon signed in as the same
person, independently), confirming on one side signs the other out, and
doing the same back on that side repeats it indefinitely
(CHANGES_20260807c_1.md §6). The confirmation prompt now says this
explicitly rather than leaving it a silent side effect. The actual fix is
attaching an email: it makes an identity portable across contexts without
ever needing the merge-and-retire machinery, so the Add-to-Home-Screen
prompt now offers it right after a successful install — installing the icon
is precisely the moment a second context is about to exist, which is a more
useful moment to ask than a generically-timed nudge would be.

Setup: enable **Authentication → Providers → Anonymous sign-ins** in the
Supabase dashboard, and apply migration 015.

### `email` — magic link plus a 6-digit code

Passwordless. The same email carries both a link and a code; the code exists
because on a phone a magic link often opens in the mail client's in-app
browser, which does not share cookies with the browser holding the session —
sign-in silently does nothing and it is baffling to debug. Six digits always
works.

Fixes both of the trade-offs above: identity is portable across devices, and
names cannot be claimed by someone else.

Requires custom SMTP (see below).

### `demo` — everyone is the same user

No sign-in at all. What you get with no configuration.

### Switching later

Change one environment variable. Nothing else. Both real modes sit on the same
`auth.users` table, so existing users keep their ids, their history and their
display names across the change — an anonymous user can even be upgraded in
place by attaching an email to it.

---

## How the recommendation engine thinks

Seven weighted components, all in `src/lib/recommend.ts`, all pure functions.
Every tunable number lives in `src/lib/recommendConfig.ts` — you can change the
app's whole personality in one file.

| Component | Weight | What it is for |
|---|---:|---|
| Cuisine affinity | 2.0 | What you rate highly, learned from your history, plus anything you explicitly liked or disliked. |
| Bayesian rating | 1.5 | Community and personal ratings, smoothed toward a prior so one glowing review does not beat forty good ones. |
| Budget fit | 1.0 | In range, one tier out, or out. |
| Walk penalty | 1.0 | Free for the first five minutes, then a cost per minute, floored. Doubles when rain is likely. |
| Variety | 1.2 | Rewards somewhere new, penalises somewhere you went yesterday, and lets a favourite come back as the memory fades. |
| Wishlist | 2.0 | Saving something makes it more likely to be suggested. Absorbed the old teammate-reco weight when Reco was removed — a received Lobang's "Add to Wishlist" is now the honest downstream path for that signal, and it only fires once the recipient actually acts on it. |

Three things are hard exclusions rather than penalties: a blocked place, a
place on your personal blocklist, and a place whose *every* cuisine you have
marked as one you would rather not eat.

**Group mode** scores each member separately and averages. A place excluded by
any single member is excluded for the group — one person's hard no outranks
everyone else's mild preference.

### Why Borda and not "most votes"

Plurality voting picks whatever the loudest minority wants. With six people and
five options, a place three people love and three people refuse can win with a
plurality while making half the table unhappy. Borda asks everyone to rank and
rewards broad acceptability, which is the actual goal when a group has to eat
together.

A voter who ranks *N* options gives *N* points to their first choice down to 1
for their last. Partial ballots are fine and are scaled by that voter's own
ballot length, so ranking three options does not buy more influence than
ranking all six. Ties break on points, then on first-place votes, then at
random.

---

## Going live

Roughly 30 minutes end to end. Everything below stays on a free tier.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (Free plan).
2. **Project Settings → API** — note the Project URL, the `anon` key, and the
   `service_role` key. The last one is a secret; it bypasses all access
   control.
3. **SQL Editor** — run every file in `supabase/migrations/` in numeric order,
   001 through 050. They are idempotent, so re-running is harmless.
4. **Authentication → Providers → Anonymous sign-ins** — turn this on. It is
   what makes name-only sign-in work.
5. **Authentication → URL Configuration** — set the Site URL to your deployed
   URL, and add `http://localhost:3000` to the redirect URLs for local work.

### 2. Email delivery — only if you switch to `email` mode

In the default `name` mode the app never sends an email, so there is nothing to
configure and you can skip straight to step 3.

If you later set `NEXT_PUBLIC_JIO_AUTH_ADAPTER=email`, this stops being
optional. Supabase's built-in email service is rate limited to a handful of
messages an hour and is explicitly not for production — and since sign-in
*is* email in that mode, hitting the limit looks exactly like the app being
broken.

Set up custom SMTP under **Project Settings → Authentication → SMTP Settings**,
and enable **Authentication → Providers → Email** with magic links on.
[Resend](https://resend.com) and [Brevo](https://brevo.com) both have free
tiers well beyond what a team of this size needs.

### 3. OneMap (optional)

Register free at [onemap.gov.sg](https://www.onemap.gov.sg/apidocs/register)
for real walking distances. Without it the app falls back to straight-line
estimates, which run about 20–30% optimistic in a dense area — everything still
works, the numbers are just softer.

### 4. Google Places (optional)

Without this, the "View on Google Maps" link on a place's page opens a
coordinate pin — same as before this feature existed, nothing breaks.
With it, the app resolves each place to its actual Google listing instead.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
   (or reuse an existing one) and enable **Places API (New)**.
2. Enable billing on the project — required even though the lookup this
   app makes should cost close to nothing at this scale (see the Free-tier
   realities section below).
3. **APIs & Services → Credentials** — create an API key, and restrict it
   to the Places API specifically.
4. Set `GOOGLE_PLACES_API_KEY` (below).
5. Once deployed, run `npm run backfill:google-places` once to resolve
   every place added before the key existed — new places resolve
   themselves automatically going forward.

### 5. Deploy

Push to GitHub, import the repo at [vercel.com](https://vercel.com), and add
the environment variables. Vercel detects Next.js with no configuration.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | From step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 1 — secret |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_JIO_AUTH_ADAPTER` | `name` (or `email` once SMTP is set up) |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | Your live URL. Used to build shareable invite links — without it the app falls back to the browser's origin, which leaves the first server render showing a bare path. Do **not** use `VERCEL_URL`: it resolves to the per-deployment hostname, not the production alias. |
| `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` | Optional, from step 3 |
| `GOOGLE_PLACES_API_KEY` | Optional, from step 4 |
| `VAPID_PUBLIC_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional — push notifications. Generate with `npx web-push generate-vapid-keys`; the public key goes in **both** variables (server and client need it under different names), same value. Without these, push silently no-ops rather than breaking anything. |
| `JIO_NAME_CLAIM_ENABLED` | Optional, defaults to `true`. Set to `false` once names genuinely aren't unique across the team anymore — typing an existing name then always signs in as (or renames) the current session rather than offering to merge. Only meaningful in `name` mode; recovery links and the admin merge tool at `/admin/accounts` both keep working unaffected either way. |

Then go back to Supabase and set the Site URL to your live URL.

### 6. Seed some places

```bash
npm run seed:manual              # 25 hand-picked spots around Bras Basah / Bugis
npm run seed:overpass            # everything OSM knows about nearby → review queue
npm run seed:walktimes           # compute and cache walking times
npm run backfill:google-places   # optional — needs step 4's API key set first
```

All four read `.env.local` and exit cleanly with a message if Supabase (or,
for the last one, the Google Places key) is not configured, rather than
failing.

### 7. Check it worked

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/discover
# {"fetched":45,"new":3,"skipped":42,...}
```

Then sign in — one name field, no email — open `/suggest`, and confirm you get
picks with reasons attached. Ask a colleague to do the same and check they show
up as a separate person on `/kakis` and in an event's vote.

---

## Free-tier realities

Things that will bite eventually. None are urgent at team scale, but you should
know they exist before they surprise you.

**Supabase pauses a free project after 7 days with no queries.** The daily
discovery cron queries the database on every run, which keeps the project
awake. This is not a side effect — it is half of why that cron exists. If you
disable discovery, add some other daily ping.

**Vercel Hobby runs each cron job at most once a day** (imprecise timing,
±59 minutes), but the old per-project job-count cap is gone — Hobby now
allows up to 100 cron jobs, confirmed directly against Vercel's docs
(last updated 2026-07-15). `vercel.json` has two: discovery at 02:00 UTC,
and the weekly review-likes recap (CHANGES_20260814.md §3) at 03:00 UTC
every Monday — comfortably under the once-a-day-per-job limit since it
only fires once a week. For anything more frequent than once a day, point
an external scheduler such as [cron-job.org](https://cron-job.org) at the
route with the same bearer token.

**Multi-office discovery is paced, not parallel.** With more than one office,
the cron sweeps them one after another with a 2s gap between each — not to
respect an Overpass rate limit (none is documented), just to avoid firing N
simultaneous requests. A time-budget check stops starting new offices once
there isn't comfortably enough of the function's 60s ceiling left, so a slow
run skips the remainder rather than getting killed mid-sweep and losing
whatever that office had already found — the skipped offices pick up on the
next day's run.

**Vercel Web Analytics and Speed Insights are on**, both free on the Hobby
plan — page views, unique visitors and Core Web Vitals in the Vercel
dashboard, no extra configuration beyond the `<Analytics />` /
`<SpeedInsights />` components already in the root layout.

**Rating aggregates are trigger-maintained columns**, not computed on read.
A row-level trigger on `visits` (migration `021_place_ratings_trigger.sql`)
recomputes `places.avg_rating`/`visit_count` for the one affected place on
every insert/update/delete — always current, no refresh schedule, and
`listPlaces()` no longer needs a visits fetch at all. The shared
`bayesianRating()` helper in `src/lib/rating.ts` is what turns those two
columns (plus, where relevant, the current user's own ratings) into the
smoothed score `recommend.ts` actually ranks on.

**OSM coverage is uneven.** Some entries are long-closed businesses, some are
vending machines tagged as cafés. Everything discovered lands in a
`needs_review` queue and never reaches suggestions until a human confirms it.
The 25 curated places in `scripts/manual-seed.json` are the fallback.

**OneMap tokens last 72 hours.** They are cached in memory and refreshed 12
hours early; a 401 clears the cache and retries once. If it still fails, the
app falls back to haversine rather than showing an error.

**Google Places requires billing enabled on the project even though the
cost at this scale should be close to nothing.** The lookup this app makes
(`places:searchText`, requesting only `id`/`displayName`/`location`) isn't
Google's fully-free Essentials/IDs-only tier — the extra two fields are
what `lib/googlePlaces.ts` needs to build its own confidence check, so
they're requested deliberately — but at one small team's worth of
occasional place adds/edits, real usage should land in the low cents,
ever, not a recurring cost. Not independently verified against Google's
live billing console — this session's sandbox blocks outbound requests to
`developers.google.com` — so treat it as reasoned from Google's published
pricing tiers, not confirmed firsthand; worth a spot-check against your
own Cloud console once real usage starts.

---

## Security notes

**Row Level Security is the access control, not the application code.** The
server-side data client always uses the anon key, so every query is subject to
RLS. `tests/clients.test.ts` asserts it never falls back to the service-role
key, even when that key is sitting in the environment — that silent-escalation
bug is exactly the kind that works fine in development and leaks everything in
production.

**The service-role client has three callers.** `/api/cron/discover`, which
needs to write to the review queue with no user session; account merge
(`mergeUserAccounts`), which needs to delete the old `auth.users` row once its
data has moved — an Auth Admin API operation no RLS policy could ever grant;
and `/api/cron/weekly-recap` (`listReviewLikesSince`), which needs to read
every user's `review_likes` rows with no user session to satisfy that
table's owner-only RLS policy. The module throws at import time if it is
ever bundled for the browser.

**`middleware.ts` validates the session once per request; every page and
route trusts that instead of repeating it.** Speed Insights showed FCP/LCP
far worse than INP/CLS pointed to — a server-response problem, not a
rendering one — and the cause was 55 pages each independently calling
`getCurrentUser()`, which makes its own network round-trip to Supabase's
Auth server, on top of the identical round-trip middleware had just made.
`getValidatedUser()` (`lib/supabase/serverAuth.ts`) now reads the already-
validated result from a request header (`AUTH_HEADER_NAME`,
`lib/supabase/authHeader.ts`) instead, falling through to a real
`getUser()` call only when that header is missing. Trusting a header like
this is normally a spoofing risk; it isn't here because `middleware.ts`
unconditionally overwrites it on every request — `Headers.set()` replaces
rather than appends — so whatever a client sent never survives to be read
downstream.

**Blog import is SSRF-guarded.** `validateBlogUrl()` rejects localhost, all the
private IPv4 ranges, link-local (which is where cloud metadata endpoints live),
and the IPv6 equivalents — including IPv4-mapped addresses in both their dotted
and hex spellings, since `new URL()` silently normalises one into the other.
One limitation to be aware of: it does not resolve DNS, so a public hostname
that resolves to a private address would still pass. Pin egress at the network
layer if that matters to you.

**Some SELECT policies are permissive on purpose.** Any authenticated user can
read events, options, kakis and profiles. Invite tokens are unguessable, so
possession of an id already implies an invite, and the alternative — recursive
membership checks inside policies — needs `SECURITY DEFINER` helper functions
that are much easier to get subtly wrong. Writes are owner-scoped throughout.
One exception: `profiles.recovery_token` (migration 041) is deliberately
*not* covered by that same permissive read — RLS is row-level, so the fix is
a column-level grant (`revoke select on profiles ... grant select (the
public columns) ...`) rather than a policy, and `getProfile()`'s query was
switched off `select("*")` accordingly, since `*` errors on any column the
role lacks privilege on rather than silently dropping it.

**Adding a place to a Jio is checked twice.** Once in the repo, for a readable
error message, and once in the RLS policy from migration 013, which is the
actual gate. Host, kaki member or explicit invitee, and only while the event is
open.

**Listing every admin needs `SECURITY DEFINER` too, for the same reason
checking one does not.** `admins_select_self` only ever lets a session see
its own row in that table — enough for an `isAdmin` check, not enough to
enumerate the allowlist. `list_admin_ids` (migration 042) exists for exactly
one caller: notifying admins when a declined name-match confirms a real
duplicate (CHANGES_20260807c.md §3 item 5) — granted to any authenticated
user, since it is the person who just signed up (not necessarily an admin
themselves) who triggers that notification.

**`admins.user_id` has no foreign key to `auth.users`, which used to mean
admin status was silently dropped on every forced re-login.** Deliberate,
per its own migration comment (017) — but it also means deleting an
`auth.users` row during an account merge never cascades to `admins`, and
`merge_user_accounts` (040) didn't touch that table either, so an admin's
row was simply left behind, orphaned, pointing at a user that no longer
existed. Confirmed bug, CHANGES_20260807c_1.md §8: any admin who went
through §4-style recovery lost admin access every time, with nothing
anywhere re-granting it, since the app deliberately never grants admin
itself. Migration 043 adds `admins` to the reassignment list, same
"surviving account's own row wins" shape as every other table
`merge_user_accounts` already handles.

**The browser-side Supabase client never writes a session cookie, on
purpose.** It exists for exactly one thing — authenticating a Realtime
websocket on the Jio detail page — which needs *reading* the current
session, never writing one. Left at its defaults, `createBrowserClient` gets
no `cookies` adapter and falls back to managing the session itself via plain
`document.cookie`, and with `autoRefreshToken` on by default, just visiting
that page starts an internal refresh loop that can rewrite the session
cookie from client-side JS. Safari's Intelligent Tracking Prevention treats
a script-written cookie differently from the real `Set-Cookie` response
header every other session write in this app uses (`middleware.ts` /
`serverAuth.ts`) — the leading theory behind an iOS-specific sign-out
reproducing in minutes rather than the access token's real ~1 hour lifetime
(CHANGES_20260807c.md §4). `src/lib/supabase/browser.ts` now passes an
explicit `cookies` adapter whose `setAll` is a deliberate no-op and disables
`autoRefreshToken`, so nothing this client does — however it might try —
can ever write a cookie. The trade-off: a tab left open with no navigation
for over an hour can see its Realtime connection go stale, since neither
this client nor the server-side middleware (which only runs on navigation)
refreshes it in that scenario. A reload fixes it; it is a soft failure, not
the sign-out this was written to close off.

**Admins are a DB-side allowlist, populated by hand.** The `admins` table
(migration 017) has no insert/update/delete policy for `authenticated` at
all — the only way into it is a direct Supabase dashboard or SQL editor
connection, on purpose, to keep "make me admin" from ever being something
the app itself can do. `repo.isAdmin(userId)` and `/api/me`'s `is_admin`
field are for the UI to decide what to render; they are not the enforcement.

**"Removing" a place blocks it, never deletes it.** `status` moves to
`blocked` instead — already excluded from recommendations and the default
places list — because a real `DELETE` risks foreign-key trouble the moment a
place has visits, event options or lobangs pointing at it. Reaching
`blocked` only ever happens through `block_place`/`unblock_place`, two
`SECURITY DEFINER` functions in migration 017: block requires being the
place's own creator or an admin, plus a non-blank reason; unblock is admin
only. A column-level `GRANT UPDATE` on `places` deliberately excludes
`status`, so a plain client-side update can't touch it at all — those two
functions (running as the table owner) are the only path, and every call
they make is logged to `place_moderation_log`, which only admins can read.

**Newly-discovered places get a lighter, separate gate.** Confirming or
dismissing something OSM discovery just added (`needs_review` →
`active`/`blocked`) goes through its own function, `review_place`, open to
any signed-in user with no reason required — that's crowd-confirmation of
data quality, not moderation of a place the team has actually been relying
on, so it deliberately doesn't share block/unblock's admin-or-creator gate.

**Any signed-in user may edit any place — the grant is derived, not
hand-listed.** Migration 027's column-level `GRANT UPDATE` on `places` is
built from `information_schema` at migration time (everything except a
fixed protected list — `status`, the trigger-maintained rating/flag
columns, provenance) rather than naming the editable columns by hand. The
earlier hand-written version is what caused a real "permission denied"
error in production: it never grew when the edit form started writing
columns it didn't cover. Deriving *which* columns are editable means a
future column needs no code change here — but the `GRANT` itself is still
a snapshot taken when the migration runs, not a standing rule, so adding a
column still needs a migration that re-issues the grant (033 does this for
`custom_cuisine_tags`). Skipping that step reproduces the exact bug this
migration exists to prevent, just for the new column instead.

**A vote option with no place record is still just an id — not a schema
fork.** `event_votes.place_id` has no foreign key to `places`, so a
free-text option (§8 of the working log) gets a generated id instead of a
real place's, and every tally/winner code path stays unchanged. Upgrading
it to a real place later goes through `attach_place_to_option`, a
`SECURITY DEFINER` function gated to the option's own adder or the Jio's
host — moving votes already cast for the draft along with it, so voting
for something before it becomes a real place doesn't discard those votes
the moment it does.

`event_options.place_id`, unlike `event_votes.place_id`, *did* carry a
foreign key to `places` — migration 029's own comment claimed otherwise,
conflating the two columns, and that gap is what produced a real
`invalid input syntax for type uuid: "draft-<uuid>"` error in production
(CHANGES_20260803.md §12a) the first time someone added a free-text
option outside the demo repo, which has no such constraint to catch it.
Migration 032 drops that foreign key and the app-level `draft-` string
prefix goes with it — `place_id` is a bare generated uuid now, same as
before 029 intended, and `label` alone marks a draft option.

**Cancelling a Jio goes through a dedicated function, same shape as
block/unblock.** `cancel_event` (migration 030) is host-only and only from
`open` — not a reuse of `closed`, since a host calling a Jio off on purpose
needs to read differently from one that simply ended without a decision.
`lunch_events` has no column-level grant restriction the way `places` does
(`closeEvent` still does a plain client update, gated only by the
host-scoped RLS policy), so this is deliberately the one column write on
that table that goes through a function rather than reworking the whole
table's grant model for one new transition.

**The invite picker is scoped to the caller's own office.** `/api/users`
resolves the caller's `user_prefs.default_office_id` (falling back to the
default office) and both filters and scopes server-side in `listAllUsers()`
itself, rather than fetching everyone and narrowing in the route or the
browser. Office is a hard boundary for discovery — see
`docs/user-discovery.md` §6 — worth treating as a defect fixed on its own
merits under PDPA, independent of how large the team gets.

**A recurring series only ever writes on its own host's behalf.** Unlike
`cancel_event` or `attach_place_to_option`, generating an occurrence
(`generateDueOccurrences`, migration 031) is a plain client write rather
than a `SECURITY DEFINER` function — deliberately, since it's triggered by
loading Home or the Jios list, and `recurring_series`/`lunch_events` both
already require `host_id = auth.uid()` to insert. The trade-off this
accepts, stated plainly: only the host's own visit generates their
series' next occurrence. A kaki member or invitee opening the app first
does not trigger it on the host's behalf — the same one-cron-a-day
constraint that shaped the discovery cron (see Free-tier realities) is
what kept this lazy rather than reaching for a service-role write path.

**A hidden-vote Jio's blindness is enforced at the API response layer, not
the database.** `hide_votes` (migration 034) is a plain host-write-only
column — RLS on `event_votes` still lets a participant read their own
ballot rows directly, same as always, since blocking that would also break
a voter seeing their own submitted ranking confirmed. What actually hides
the aggregate from everyone else is `redactHiddenVotes()` in
`src/lib/voting.ts`, which every route returning an `EventDetail` — the
vote route above all, but also options, RSVP, invitees, availability,
candidate-dates and suggest-options — runs its response through before
`json()`. That number of call sites is exactly the shape of bug this
codebase has already shipped twice (§1's grant, §12a's uuid): one function,
applied everywhere, rather than trusting N handlers to each remember.

**"Rated by your Kaki group" inherits the same visibility limit
`computeKakiMetrics` already has.** Both aggregate ratings across a Kaki's
members by calling `listVisits` once per member — subject to the same RLS
as any other query (`user_id = auth.uid() or is_public = true`), so a
private, unshared rating from a groupmate is invisible to this computation
in live mode, same as it already was for the Kaki page's group favourites.
Not a new gap this feature introduces, just one it inherits.

**The admin analytics dashboard reads across every user's data on purpose,
through a `SECURITY DEFINER` function, not the plain anon-key client.**
`get_admin_analytics` (migration 035) checks `admins` itself before
returning anything — same shape as `resolve_place_flags`/`block_place`:
privilege is earned by the check inside the function, not by which key
signed the request. This is deliberately different from "rated by your
Kaki group" above, which stays on the plain client and inherits RLS's
private-data limit — an admin dashboard's whole job is seeing the true
aggregate, a per-user feature's isn't.

**Staying signed in depends on `middleware.ts`, not just the Supabase
client config.** `@supabase/ssr`'s access token is short-lived; the refresh
token is what's supposed to rotate it before it expires, and that rotation
has to persist a new cookie. Server Components can't set cookies at all —
so before this middleware existed, a refreshed session was computed and
then silently discarded on every request past the first, and the token
eventually expired for real. `getCurrentUser()` then reads "no valid
session" as "never signed in," which is exactly what sent a returning user
back through onboarding into a brand-new anonymous identity, orphaning
everything tied to the old one. Middleware is the one place in the request
pipeline that *can* persist a refreshed cookie before a Server Component
ever runs, which is also why this couldn't have been fixed anywhere else.

**Following an event's own invite link now actually registers the visit.**
`join_event_via_invite` (migration 036) is `SECURITY DEFINER` because
`event_invitees_insert`'s RLS policy is host-only by design — a visitor
adding themselves needs the same kind of deliberate, gated exception as
`attach_place_to_option`, not a loosened policy that would also let a host
be invited-added by anyone who merely knows their event exists. Narrow on
purpose: the function only ever inserts a row for `auth.uid()`, never an
id passed in, so it can't be used to invite anyone else.

**Push notifications read across users the same way admin analytics
does, for the same reason.** `get_push_targets` (migration 037) is
`SECURITY DEFINER` because both `push_subscriptions` and `profiles` are
owner-scoped by RLS — notifying someone as a side effect of *your* action
(inviting them, closing a Jio) means reading *their* subscription, which a
plain client query would refuse. Unlike `get_admin_analytics`, there's no
admin check: any signed-in user legitimately triggers these sends just by
using the app normally, the same "any authenticated teammate" trust
boundary the rest of this single-office app already runs on. Also unlike
the Kaki-rating/admin-analytics pair above, this one stays a narrow,
purpose-built read (exactly the columns the send path needs) rather than
a broadened table-wide SELECT policy — a push endpoint and keys are more
sensitive than a display name or a rating.

**The two remaining push triggers — "someone voted" and the pre-start
reminder — are `SECURITY DEFINER` for the same shape of reason, and
deliberately not cron.** `claim_vote_push_window` (migration 038) and
`claim_event_reminder` (migration 039) each need to write a timestamp onto
`lunch_events`, but `lunch_events_update`'s RLS policy is host-only — and
the caller claiming the window is whoever just voted, or whoever's page
load happened to trigger the reminder check, not necessarily the host.
Both are one-purpose atomic claims (`UPDATE … WHERE … RETURNING`, nothing
else), the same narrow shape as `claim_vote_push_window`'s neighbour. And
both fire inline from a normal request rather than a cron job: Vercel
Hobby's cron already runs once a day for discovery (see the recurring-series
note below), nowhere near frequent enough for either "wait for voting to go
quiet" or "fire 30 minutes before an arbitrary time of day" — so the vote
route claims its window the instant a vote lands, and the reminder rides
the same lazy, page-load-triggered pattern `generateDueOccurrences` already
uses for recurring series. The trade-off is the same one stated there: the
reminder only actually fires when *someone* with a stake in the Jio has the
app open somewhere near that 30-minute mark, not on a guaranteed clock.

**The like-triggered push reuses that exact shape; the weekly recap is the
one push that's cron rather than inline, because it genuinely needs to be.**
`claim_review_like_push_window` (migration 048) is the same one-purpose
atomic claim as `claim_vote_push_window`, fired inline from the like route
the instant a like lands — no cron slot needed, same as vote-push. The
weekly recap can't work that way: "how many likes this week" only means
something once the week is over, not the instant any single like happens,
so it's the one push in this app that genuinely needs a scheduled sweep
rather than firing off a user action. That's what earns it the second
`vercel.json` cron entry rather than a third inline claim function.

**Account merge writes across two different `auth.uid()`s, so it has to be
`SECURITY DEFINER` — and it has to check *which* two.** `merge_user_accounts`
(migration 040) moves every row a `user_id`-owned table has for one account
onto another (Jios hosted, votes, RSVPs, invites, Kaki ownership/membership,
wishlist, visits, push subscriptions, prefs), which no RLS policy could ever
permit as a plain write. The authorization is deliberately narrower than
"any admin, any pair": the caller must either be merging into their *own*
current session (self-service name-claim / recovery-link redemption,
CHANGES_20260807.md §4) or be an admin merging two accounts that are neither
their own (§5's admin tool) — never an arbitrary user moving a stranger's
data around. Composite-PK tables (votes, RSVPs, invites, Kaki membership,
wishlist) get an explicit collision check first — if both accounts already
have a row for the same event/kaki/place, the surviving account's own row
wins and the merged-in duplicate is dropped, rather than erroring on the
resulting duplicate key.

**Recovery-link generation is gated the same way merge is; redemption
deliberately is not.** `generate_recovery_token` (migration 041) — self, or
admin for someone else — matches `merge_user_accounts`'s authorization
exactly, since it's gating access to the same underlying capability one step
removed. `resolve_recovery_token` has no auth check at all: same "possession
of the token is the invite" reasoning already applied to every other
unguessable token in this schema (`lunch_events.invite_token`,
`kakis.invite_token`) — the token itself is the credential, checking the
caller's identity on top of it wouldn't add anything since whoever is
redeeming it *is*, by construction, whoever's browser currently holds the
link.

**Adding someone to a Kaki directly needs the same `SECURITY DEFINER`
escape hatch as the invite link's own join step.** `kaki_members_insert`'s
RLS policy is `user_id = auth.uid()` — you may add yourself, no one else —
so `add_kaki_member` (migration 045) exists for exactly the same reason
`join_event_via_invite` does: a legitimate second-party write RLS is never
going to allow by policy alone. Authorization is narrower than "any
signed-in user": the caller must already be a member of the Kaki they're
adding someone to, checked inside the function before the insert runs, not
left to the application layer alone.

**Merging an account now also carries the earlier `profiles.created_at`
forward.** Migration 044 extends `merge_user_accounts`'s existing `create or
replace` with one `least()` update: the survivor keeps whichever signup
date is older. Everything else about a merge was already collision-safe
across owned tables; this closes the one field that wasn't — without it, a
merge silently rewrote history by making a years-old account look brand
new, which is exactly what was distorting the admin analytics "new users"
chart (CHANGES_20260812.md §5).

**The public place-preview page is the first route in this app an
anonymous request can see anything through, so it earns its own function
rather than a loosened policy.** `places_select` (007_rls.sql) is
`for select to authenticated using (true)` — a signed-out visitor runs as
Postgres role `anon`, which that policy grants nothing to, so a plain
`select` from `places` already returns nothing for them; there was no
accidental exposure to patch. `get_public_place` (migration 046, widened by
047 and again by 049) is `SECURITY DEFINER`, callable by `anon`, and
returns the `PublicPlace` shape — name, address, cuisine, best dishes,
aggregate rating, `lat`/`lng`, and `google_place_id` — scoped to
`status = 'active'` so a
still-under-review or blocked place never becomes the first thing a
forwarded link shows a stranger. `place.id` doubles as the public
identifier rather than a new invite-token system: it's already an
unguessable UUID, and the function's own `status` filter is what keeps it
from being useful for anything beyond a place already meant to be public.
`lat`/`lng` are included deliberately (migration 047,
CHANGES_20260814.md §2) so a signed-out visitor gets the same "View on
Google Maps" link a signed-in one does — every place here is a restaurant
or eatery already publicly discoverable on Google Maps regardless, so the
exact pin doesn't carry the same sensitivity as `notes` or `created_by`,
both still excluded, along with the named review list entirely — visits
were only ever shared with "the team," not the public internet, and
nothing about this feature changes that consent. A signed-in visitor who
opens a `/p/[id]` link is bounced straight to the full `/places/[id]` page
instead of seeing the cut-down version — same reasoning as `/k/[token]`
sending an existing Kaki member straight into the group rather than a join
screen they don't need.

**Review likes are the one place a second-party write needs the same
`SECURITY DEFINER` throttle shape as vote-push, for the same reason.**
`claim_review_like_push_window` (migration 048) exists because
`visits_update` (007_rls.sql) is `user_id = auth.uid()` — only a review's
own author may write to it — but the person claiming the push window is
whoever just liked the review, not its author. Matches
`claim_vote_push_window` (038) exactly: an atomic claim-the-window update
rather than a real debounce, since Vercel Hobby's cron is nowhere near
frequent enough to wait out a quiet period. `review_likes` itself needs no
elevated path at all — a user's own like/unlike is already covered by
plain RLS scoped to `user_id = auth.uid()`, same as `wishlist`. Reading
across every user's likes for the weekly recap is the one place this
reaches for the service-role client instead: the cron runs with no user
session, so there's no `auth.uid()` for RLS to match, the same "no session
to go through RLS with" situation as the discovery cron's writes
(`lib/supabase/serviceClient.ts`).

**`google_place_id` is excluded from a plain place edit the same way
`status` is, and for the same reason: a client that could set it directly
could point a place's Maps link at an arbitrary listing.** 027's dynamic
column grant (see "Adding a new *protected* column" in its own comment)
made this a one-line change rather than a new mechanism: migration 049
just re-runs that same derivation with `google_place_id` added to the
exclusion list, and adds `set_google_place_id` — a narrow `SECURITY
DEFINER` function, `status`'s exact shape — as the one legitimate way to
set it. Only the app server calls it, right after
`resolveAndStoreGooglePlaceId` (`lib/googlePlaces.ts`) runs following a
create or a name/address edit, never from client input directly.

**Two tables' RLS policies must never each hold a subquery into the
other — `lobangs`/`lobang_recipients` did, and it broke every send.**
019_lobang_group_send.sql gave `lobangs_select` a subquery into
`lobang_recipients`, and gave `lobang_recipients_select`/`_insert`/
`_delete` each a subquery back into `lobangs`. Evaluating either table's
RLS-protected subquery requires evaluating the other table's policy, which
requires the first table's policy again — Postgres has to expand that into
the query plan before execution even starts, so it hit a genuine,
unbounded A→B→A cycle and refused with "infinite recursion detected in
policy for relation" (SQLSTATE 42P17), deterministically, on every
`sendLobang()` call, not intermittently. 050_fix_lobang_rls_recursion.sql
fixes it with the same `SECURITY DEFINER` escape hatch used everywhere
else in this file for "one table's policy legitimately needs to read
another's" — `is_lobang_sender`/`is_lobang_recipient` each do their lookup
as the function owner, bypassing RLS for that one query, so checking "is
this mine" no longer re-triggers the other table's policy. Worth
remembering as a standing rule for any future pair of RLS-protected tables
that reference each other: at most one side may hold a plain subquery into
the other; the other side needs a `SECURITY DEFINER` function instead.

---

## Tests

```bash
npm test          # 400 tests across 33 files
npm run typecheck
npm run lint
```

| File | Covers |
|---|---|
| `recommend.test.ts` | Every scoring component, exclusions, ranking, boosts, group mode |
| `blogImport.test.ts` | HTML extraction and the full SSRF matrix |
| `eventAdditions.test.ts` | Who can add, remove, invite, vote and close; joining via an invite link makes a stranger a real invitee, not just visible; the vote-push throttle window; the starting-soon reminder's timing, one-shot firing, and non-responder targeting |
| `accountMerge.test.ts` | Duplicate-name grouping; merge authorization (self vs. admin vs. neither); row reassignment and collision handling across every owned table; recovery-token generation, resolution, regeneration, and cleanup after a merge; listing every admin |
| `metrics.test.ts` | User and group statistics, cuisine streaks |
| `discovery.test.ts` | OSM normalisation and deduplication |
| `voting.test.ts` | Borda count, partial ballots, tie-breaking |
| `weather.test.ts` | Rain detection and weather-aware ranking |
| `clients.test.ts` | The Supabase client factories cannot escalate privilege |
| `auth.test.ts` | Every auth adapter answers every method, and refuses cleanly |
| `repoConformance.test.ts` | Both repos implement the same interface |
| `rating.test.ts` | Bayesian smoothing over the trigger-maintained columns |
| `visitEdit.test.ts` | Editing and deleting your own visits: ownership, and which fields an edit may touch |
| `moderation.test.ts` | Block, unblock, and the admin allowlist |
| `placeFlags.test.ts` | Flagging a place and resolving the queue |
| `lobang.test.ts` | Targeted sends, group-send member snapshotting |
| `flexiJio.test.ts` | Availability voting and host confirmation |
| `suggestCommittee.test.ts` | The three-pick suggestion and re-roll rules |
| `onboarding.test.ts` | The one-time welcome gate |
| `placeEditing.test.ts` | Any signed-in user can edit a place; `status` cannot move through a plain edit |
| `placelessVoteOptions.test.ts` | A free-text vote option with no place record: tallying, winning, and attaching a real place afterward without stranding existing votes |
| `cancelEvent.test.ts` | Host-only cancellation, only from `open`, stays findable afterward |
| `userDiscovery.test.ts` | Server-side name filtering and office scoping for the invite picker |
| `recurringSeries.test.ts` | Recurring-series date math (lookahead window, no double-generation), fixed vs. voted occurrences, fresh kaki-membership expansion per occurrence |
| `sortPlacesForList.test.ts` | `/places`'s nearest-first default vs. the highest-rated sort, unrated places sinking rather than sorting first, tie-breaking |
| `hiddenVotes.test.ts` | A hidden-vote Jio's standing is blind only while open, reveals on close, and voter count is distinct voters not ballot rows |
| `kakiRating.test.ts` | "Rated by your Kaki group" averages only the member set's ratings, scoped independently per place; the companion visit-count used for the badge/filter's minimum-2 threshold |
| `adminAnalytics.test.ts` | Asia/Singapore day/week bucketing across the UTC boundary, median with no-data returning `null` not `0`, walk-time bucket edges |
| `kakiMembers.test.ts` | Adding an existing user to a Kaki directly: any current member can, a non-member can't, no duplicate membership, rejects a nonexistent group |
| `publicPlace.test.ts` | The public place-preview data: only the safe field subset, never `notes`/`created_by`, carries `lat`/`lng`, hides `needs_review` and `blocked` places, computed rating and visit count match the authenticated view |
| `reviewLikes.test.ts` | Toggling a like on/off, independent counts across multiple likers, `liked_by_me` populated only for a known viewer, the like-push throttle window (claims once, refuses within the window, claims again after), and `listReviewLikesSince`'s cutoff filtering |
| `googlePlaces.test.ts` | The Google Maps link confidence gate (`nameSimilarity` — exact/reordered/partial/unrelated/punctuation/empty-input matches) and the link builder (`googleMapsPlaceUrl` — real listing when a place id is present, coordinate fallback otherwise) |
| `lobangFeed.test.ts` | `mergeLobangFeed`'s tag-and-sort: direction tagging, newest-first ordering across both lists, either list empty, and that it doesn't mutate its inputs |

**`npm test` does not typecheck.** Vitest transforms TypeScript with esbuild,
which strips annotations without checking them, and the suite is all pure
logic and adapter conformance — no component renders, no route handlers. A
green run says nothing about whether the app compiles. `npm run typecheck` is
the other half of the gate.

---

## Not built yet

1. **Custom domain.** Currently `*.vercel.app`. Point DNS, add the domain in
   Vercel, then update the Supabase Site URL and redirect URLs.

---

## Attribution

Place data from [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, ODbL. Walking routes from
[OneMap](https://www.onemap.gov.sg), © Singapore Land Authority. Weather from
[data.gov.sg](https://data.gov.sg). Maps rendered with
[Leaflet](https://leafletjs.com).

Jio does not scrape Google, Burpple or HungryGoWhere. Their terms forbid it,
and in Singapore the Computer Misuse Act makes it a worse idea than usual.
Everything here is open data or something a user typed in.
