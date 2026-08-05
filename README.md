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
| **Jios** | Create a lunch outing, everyone ranks the options, a Borda count decides. RSVP, live vote updates, a roulette wheel for when the group genuinely cannot choose, and a month calendar with Hosting / Invited / Past filters for browsing. Anyone can edit a place, any signed-in user may edit any place's details, and the host can cancel a Jio outright — it stays visible, marked cancelled, rather than vanishing. Once a Jio is decided, its result — place, time, final points — can be copied or shared as a PNG, generated client-side, for pasting straight into a chat instead of a link. A host can also start a Jio with votes hidden: nobody, host included, sees the running standing until it closes — only the ballot count shows. |
| **Vote on a place that isn't listed yet** | Typing a name the search doesn't find logs it as a vote option immediately, no place record required. A non-blocking prompt afterward offers to add it to the pool; declining leaves it exactly as a text-only choice, permanently. |
| **Kakis** | Lunch groups with a shareable invite link and shared stats — group favourites, who eats out most, who is most adventurous. |
| **Places** | Searchable list with cuisine, budget, walk-time and rating filters, sortable by nearest, highest-rated, or rated by your Kaki group. Add places by hand, import candidate names from a food blog, or let the daily cron find them on OpenStreetMap. Cuisine tagging covers a fixed, scored list (now including Modern and Traditional) plus free-text "Other" tags that show on the place but never affect recommendations. |
| **Map** | Leaflet map of everything in walking distance, with real walking routes when OneMap is configured. |
| **Reviews** | Log a visit privately, or share it as a review. Each visit is its own entry, editable and deletable later — including un-sharing a review back to private. |
| **Saved places** | Bookmark anywhere from any list. `/places` has an All / Saved split, and saving nudges a place up your own suggestions. |
| **Weather** | Checks the NEA two-hour forecast. When rain is likely, the walk penalty doubles and closer places quietly rise. |
| **Metrics** | What you actually eat versus what you think you eat, plus a nudge when you have had the same cuisine three days running. |
| **Home** | A quick-action dashboard, not a second Jios list: today's Jio becomes the headline when there is one; a capped list (next one or two) of what's coming up otherwise; "Same as last time?" one-tap repeat of your last hosted Jio. |
| **Recurring Jios** | A standing weekly Jio — same place every time (auto-confirmed, no vote needed) or a vote over the same option pool each week. Generates its next occurrence lazily, a few days ahead, when the host loads Home or Jios; invitees are expanded fresh from current kaki membership every time, not frozen at series creation. |
| **Admin** | Moderation (reports, block/unblock), an analytics dashboard (growth, Jio outcomes, top places, Kaki activity, moderation and wishlist trends, a same-day participation funnel), and office management — all reachable from "You", no dedicated nav icon, since admins are the one group that needs it least often. |

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

- **Identity is bound to the browser.** Clear site data and you come back as a
  new person with no history. Your phone is a different user from your laptop.
- **Anyone can claim any name.** There is no secret, so nothing stops someone
  typing a colleague's name. Fine for a team that already trusts each other.

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
   001 through 035. They are idempotent, so re-running is harmless.
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

### 4. Deploy

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

Then go back to Supabase and set the Site URL to your live URL.

### 5. Seed some places

```bash
npm run seed:manual      # 25 hand-picked spots around Bras Basah / Bugis
npm run seed:overpass    # everything OSM knows about nearby → review queue
npm run seed:walktimes   # compute and cache walking times
```

All three read `.env.local` and exit cleanly with a message if Supabase is not
configured, rather than failing.

### 6. Check it worked

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

**Vercel Hobby runs crons at most once a day.** `vercel.json` is set to 02:00
UTC accordingly. For anything more frequent, point an external scheduler such
as [cron-job.org](https://cron-job.org) at `/api/cron/discover` with the same
bearer token.

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

---

## Security notes

**Row Level Security is the access control, not the application code.** The
server-side data client always uses the anon key, so every query is subject to
RLS. `tests/clients.test.ts` asserts it never falls back to the service-role
key, even when that key is sitting in the environment — that silent-escalation
bug is exactly the kind that works fine in development and leaks everything in
production.

**The service-role client has one caller.** `/api/cron/discover`, which needs
to write to the review queue with no user session. The module throws at import
time if it is ever bundled for the browser.

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

**Adding a place to a Jio is checked twice.** Once in the repo, for a readable
error message, and once in the RLS policy from migration 013, which is the
actual gate. Host, kaki member or explicit invitee, and only while the event is
open.

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

---

## Tests

```bash
npm test          # 326 tests across 27 files
npm run typecheck
npm run lint
```

| File | Covers |
|---|---|
| `recommend.test.ts` | Every scoring component, exclusions, ranking, boosts, group mode |
| `blogImport.test.ts` | HTML extraction and the full SSRF matrix |
| `eventAdditions.test.ts` | Who can add, remove, invite, vote and close |
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
| `kakiRating.test.ts` | "Rated by your Kaki group" averages only the member set's ratings, scoped independently per place |
| `adminAnalytics.test.ts` | Asia/Singapore day/week bucketing across the UTC boundary, median with no-data returning `null` not `0`, walk-time bucket edges |

**`npm test` does not typecheck.** Vitest transforms TypeScript with esbuild,
which strips annotations without checking them, and the suite is all pure
logic and adapter conformance — no component renders, no route handlers. A
green run says nothing about whether the app compiles. `npm run typecheck` is
the other half of the gate.

---

## Not built yet

In rough priority order.

1. **Push notifications.** Migration 025 created the tables; nothing else is
   wired. Still needs the `web-push` dependency, VAPID keys, a subscribe
   endpoint, service-worker `push`/`notificationclick` handlers, and the send
   calls. Note that iOS only delivers Web Push to a PWA installed to the home
   screen — a normal Safari tab cannot even ask for permission. The
   strongest single case for it: a cancelled Jio is only discoverable by
   opening the app, since nothing tells invitees it happened.
2. **Custom domain.** Currently `*.vercel.app`. Point DNS, add the domain in
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
