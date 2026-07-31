# Changelog — Design Decisions

> Running log of design decisions made during planning, before
> implementation. Each entry links to the doc where the full spec lives.
> `jio.md` (the original handoff doc) is updated in parallel to cross-reference
> these where relevant.

---

## 2026-07-30

### Reco (Food Pool) removed; Lobang extended to user→group send
**Docs:** `docs/push-notifications-and-lobangs.md` §11, `jio.md` (multiple sections)

- **Evaluated and removed Reco entirely.** Reco (ambient broadcast "I
  recommend this," no visit required, home-feed feed) and Lobang (targeted
  send, with push) were found to solve the same underlying impulse at
  different audience scope — once Lobang existed with real push + a
  persistent inbox, Reco's no-notification, easy-to-scroll-past design made
  it the strictly weaker mechanism, with no clear reason to pick it over
  Lobang. Shared Reviews already cover "surfacing opinions on a place you
  visit," so Reco's one distinct niche (recommend without having visited)
  was judged too narrow to justify a fully separate feature.
- **Files/sections touched by the removal:**
  - `jio.md`: removed the "Recos (Food Pool)" feature inventory row;
    removed the `Repo` interface's Recos section; removed the `recos`
    table schema section (replaced with a deprecation note); removed the
    `recos` RLS table row; removed the `recoBoost` scoring-config row;
    removed recos mentions from the demo-data description, project
    structure comments, and local-dev verify steps; marked migration
    `009_recos.sql` as a no-op placeholder (not renumbering subsequent
    migrations, to avoid a much larger diff across every doc that
    references migration numbers like "013").
  - `src/types/index.ts`: removed the `Reco` interface.
  - `src/lib/data/index.ts` (Repo interface scaffold): removed `Reco`
    import and the four Recos methods (`createReco`, `deleteReco`,
    `listRecos`, `listRecosForPlace`).
- **Lobang extended to support group-send:** a Lobang can now target
  either specific individuals (unchanged) **or an entire Kaki group**,
  notifying every member. Implementation snapshots group members into
  individual `lobang_recipients` rows **at send time** rather than
  dynamically resolving membership later — avoids a real bug class where
  membership changes after the fact would silently alter who "received" a
  past lobang. New nullable `lobangs.kaki_id` column for display
  provenance only ("sent to LazadaOne Lunch Kakis"); the actual
  notification trigger needs zero changes since it already loops over
  whatever recipient list it's given.
- `sendLobang()`'s signature updated to take a discriminated `target`
  (`{ type: "users", userIds }` or `{ type: "kaki", kakiId }`) instead of
  a bare recipient list.
- Sender UI: recipient picker gets two modes (individual multi-select vs.
  single Kaki-group select), not combinable in one send, to avoid
  ambiguous duplicate-handling states.
- **Follow-up decisions:** group-send is restricted to Kakis the sender is
  actually a member of (not any Kaki); the sender is excluded as a
  recipient even if they're a member of the target Kaki; `recoBoost`'s
  removed weight (1.0) was redistributed — not just dropped — fully into
  `wishlistBoost` (1.0 → 2.0), since a received Lobang's "Add to Wishlist"
  action is now the honest downstream path for the old "teammate
  recommended this" signal, only firing once the recipient actually acts
  on it rather than the instant anyone sends a lobang. `jio.md`'s
  recommendConfig table updated accordingly.

---

### Flag Inaccurate Places (admin review)
**Doc:** `docs/place-flagging.md`

- Introduces Jio's **first app-wide admin role**: a real `is_admin` column
  on `profiles` (chosen over a hardcoded env-var admin ID — more setup now,
  scales cleanly if a second admin is ever added). New `requireAdmin()`
  in `auth.ts`, mirroring the existing `requireUser()` pattern.
- New `place_flags` table: `reason` enum (closed/wrong_info/duplicate/
  inappropriate/other), optional comment, `status` (pending/resolved),
  `resolution` (dismissed/edited/archived).
- **Multiple flags per place are allowed and batched** — no unique
  constraint blocking repeat reports; admin resolves *all* pending flags
  for a place in one action, not one at a time.
- **Places show a "Reported" badge** to all users while a flag is pending
  — a transparency choice, since the place stays fully active/bookable
  until the admin acts. Backed by a trigger-maintained
  `places.has_pending_flag` boolean, same pattern as
  `docs/place-ratings-trigger.md` (cheap, always-current, no join needed).
- Archiving reuses the **existing** `places.status = 'archived'` value —
  no new place-visibility logic needed.
- **Gap closed:** the pre-existing general `updatePlace()` /
  `PUT /api/places/[id]` route had no admin check at all — meaning any
  signed-in user could archive a place directly, bypassing the whole
  flag/review process. Fixed as part of this feature: `status` changes on
  `places` (specifically to/from `'archived'`) are now admin-only, both at
  the application level and via RLS. This was prompted by an explicit
  requirement that only admins can block/hide a location.
- **Flagger identity:** shown by name in the admin queue (sole-admin,
  trusted-team context makes anonymizing a net negative).
- **Flagger-facing visibility:** users can see their own reports' status
  via a new "My Reports" view (`listMyFlags()`), not fire-and-forget.
- **No push notification on resolution** — stays pull-based via "My
  Reports" for now.
- `jio.md` feature inventory updated with a new row (flagged
  designed-not-yet-implemented).

---

### Suggest by Committee — "What to eat? Don't know?"
**Doc:** `docs/suggest-by-committee.md`

- New "Can't decide? Suggest 3" button in an event's place-options area,
  auto-adding candidates directly into `event_options` (no preview/confirm
  step — the whole point is removing a decision, not adding a new one).
- **Reuses the existing recommendation engine** rather than new scoring:
  the 2 personalized picks call the existing `groupRecommend()`; the
  exploratory pick reuses `bayesianRating()` (from
  `docs/place-ratings-trigger.md`) over a novelty-filtered pool.
- **2 personalized picks** scored against only invitees who've **RSVP'd
  yes/maybe** — falls back to all invitees if nobody's responded yet.
- **1 exploratory pick** is defined as novel **to this specific group**
  (none of the relevant invitees have visited), not globally novel like
  `/suggest`'s existing `surprisePick()` — a deliberately different
  novelty definition worth keeping distinct. Falls back to
  least-visited-by-group if the team's been everywhere already.
- **Re-roll:** allowed, excludes previously-suggested places in the same
  session. On re-roll, untouched (no-votes-yet) suggested options are
  removed and replaced; any suggested option that's already received a
  vote is left in place rather than pulled out from under a voter.
- New `event_options.is_suggested` boolean column — **user-visible**, not
  just re-roll bookkeeping: committee-picked options show a small
  "Suggested" badge in the voting list.
- `jio.md` feature inventory updated with a new row (flagged
  designed-not-yet-implemented).
- **Re-roll cap:** no limit — hosts can re-roll as many times as they
  want; revisit only if usage data later suggests an abuse vector.
- **Badge decision:** committee-suggested options are visually badged
  ("Suggested"), not indistinguishable from manually-added ones.

---

### Flexi Jio — availability-based date voting
**Doc:** `docs/flexi-jio.md`

- New second event type alongside the existing default **Jio** (naming
  note: the default type stays called plain "Jio," not "Fixed Jio," to
  avoid an awkward/unnecessary label change on the existing feature).
- Two-phase model: `date_phase: 'polling' | 'confirmed'`. Once confirmed,
  a Flexi Jio behaves identically to a regular Jio for place voting, RSVP,
  roulette, and close — no new UI needed for phase 2.
- **Voting model: availability-style** (mark which dates you're free),
  deliberately not ranked-choice — different mental model from the
  existing Borda place-voting, doesn't reuse `voting.ts`. A vote row is
  just presence ("I'm free on this date"); marking availability fully
  replaces a user's prior selection rather than adding to it.
- **Minimum 2 candidate dates**, enforced at creation.
- **Adding candidate dates after polling starts is allowed** — mirrors the
  existing `addOptionToEvent()` host/kaki-member/invitee authorization
  pattern and RLS approach (migration 013) rather than inventing a new one.
- **Host confirmation mirrors the existing roulette-override pattern**:
  the most-available date is pre-highlighted, but the host can confirm a
  different date manually — reuses an existing UX precedent rather than
  introducing a new one.
- RSVP stays phase-2-only, not conflated with availability-marking.
- **Home page:** new "Needs your availability" section, placed directly
  below the existing "Pending Jios" section. Shows **all** polling Flexi
  Jios the user is invited to (not filtered to unmarked ones) —
  already-marked entries appear greyed/checked rather than hidden. On
  confirmation, a brief "Confirmed for [date]!" state shows before the
  event moves into the normal upcoming-events calendar.
- **No automated stale-poll push nudge** — decided against it; Flexi Jio
  polling stays manual/host-driven for now, to avoid adding notification
  scope before the core feature has shipped. Revisit only if real usage
  shows it's needed.
- `jio.md` feature inventory table updated with a new row (flagged as
  designed-not-yet-implemented). All three previously-open questions
  (confirmation transition, section scope, stale-poll nudge) are now
  resolved — see `docs/flexi-jio.md` §11.

### Push notifications & Lobangs
**Doc:** `docs/push-notifications-and-lobangs.md`

- Web Push (VAPID + `web-push` package) chosen over any third-party push
  service — free, no vendor lock-in, works with the existing `sw.js`.
- Two notification types, two independent opt-in toggles:
  **Jio invites** (event lifecycle — invite created, vote needed, event
  closing, winner announced) and **Lobangs** (new feature, see below).
- **Lobangs** are a new, targeted feature: a user picks specific
  teammate(s) and sends them a place, distinct from the existing broadcast
  Recos/Food Pool feed. New tables: `lobangs`, `lobang_recipients`.
- **Decision:** lobang push notifications are triggered *only* by the
  direct send action — no cron, no discovery-based, no rating-threshold
  triggers. Deliberately low-frequency by design.
- **Decision:** receiving a lobang does **not** auto-add the place to the
  recipient's wishlist (would pollute the recommendation engine's
  wishlist-boost scoring with someone else's opinion, not the user's own
  signal). Instead: lobangs live in a persistent inbox; a one-tap "Add to
  Wishlist" action bridges to wishlist with `source='lobang'` provenance.
- Push delivery strategy documented: VAPID key handling, multi-device
  subscriptions per user, dead-subscription cleanup piggybacked on send
  failures (410/404), permission-prompt UX (gesture-triggered only, no
  load-time prompts), payload/rate limits, and the principle that the
  inbox/events list is always the source of truth — push is a nudge, never
  the only place data exists.
- Open questions flagged (not yet decided): lobang expiry, replies/reactions,
  per-user daily send rate limit, quiet hours, notification grouping via
  the `tag` field, denied-permission fallback, PDPA consent note.

### Onboarding welcome screen
**Doc:** `docs/onboarding.md`

- Scope: a single one-time `/welcome` screen for new users, not a
  multi-step wizard. Captures name/nickname only — cuisine/budget
  preferences explicitly excluded, stay on `/profile` as today.
- Office is shown as a **locked field reading "LazadaOne"** with a caption
  explaining it's pilot-only — not a real picker, since only one office is
  functionally usable right now despite the schema supporting more.
- Trigger: new `profiles.onboarded_at` column, `null` gates the redirect to
  `/welcome`; existing users backfilled on migration so nobody sees it
  retroactively.
- No skip button — friction judged low enough (one field + a statement)
  that skipping wouldn't save meaningful time.
- `jio.md` §14.1 renamed from "Supabase Profiles → Display Names Beyond
  UUID Prefix" to "Welcome Screen for New Users" and repointed at the new doc.

### Place ratings — trigger-maintained columns (replaces "materialized view")
**Doc:** `docs/place-ratings-trigger.md`

- Chose a **row-level trigger** on `visits` (insert/update/delete) over a
  scheduled materialized view — recomputes only the one affected place per
  write, always current, no refresh schedule or staleness window, no
  wasted recomputation of unaffected rows.
- New stored columns on `places`: `avg_rating`, `visit_count`,
  `rating_updated_at` — plain SQL aggregates only, no formula duplication
  risk.
- **Bayesian-smoothed rating stays in TypeScript**, computed from those two
  cheap columns via one shared `bayesianRating()` helper in
  `src/lib/rating.ts` — both `recommend.ts` and anywhere else needing a
  rating call the same function, so `recommendConfig.ts`'s prior constants
  only ever need tuning in one place.
- Effect on `/suggest`: `rankPlaces()` no longer needs a full visits fetch
  to compute ratings — the expensive aggregation moves from "every
  `/suggest` page load" to "once per visit insert," which is the correct
  place for that cost to live. Personalized scoring components (cuisine
  affinity, wishlist boost, walk penalty, weather, variety/repetition)
  remain in-app since they're inherently per-user.
- No Repo signature change needed for this — `Place`'s `avg_rating`/
  `visit_count` fields just become real columns instead of computed values.
- `jio.md` §14.3 renamed from "Materialized View for Place Ratings" to
  "Trigger-Maintained Rating Columns" and repointed at the new doc; the
  Known Risks table row (§10) also updated to point forward.
- Open questions: whether `rating_updated_at` should ever surface in the
  UI (leaning: no, internal-only); add a test case confirming rating
  edits/deletes recompute correctly, not just inserts.
**Doc:** `docs/places-list-pagination.md`

- Default sort: **walk time, ascending** (nearest first) — chosen over
  Bayesian rating specifically to minimize compute: `walk_minutes` is
  already a stored `walk_cache` column, so this is a plain indexed
  `ORDER BY` with no in-app aggregation, unlike a rating-based sort which
  would require fetching all visits first. Also more true to the app's
  core "within a 15-min walk" pitch. `/suggest`'s Bayesian-rating scoring
  is unaffected — this only changes the plain `/places` browse list.
- Tie-break order: walk_minutes → visit_count (stored count, still cheap)
  → name (alphabetical). Rating deliberately excluded from the tiebreak to
  avoid reintroducing the visit-fetch cost this approach exists to avoid.
- Places without a cached walk time yet (not enriched) sort last
  (`NULLS LAST`), not as "closest."
- Pagination: 15 per page via a **"Load More"** button (not numbered
  pages) — fits mobile-first PWA UX better.
- Repo signature change (breaking): `listPlaces()` now returns
  `{ places, total }` instead of `Place[]`, with an optional
  `pagination` param; `/suggest` and `/map` keep calling it unpaginated.
- **No longer depends on** the materialized-view work (`jio.md` §14.3) —
  unlike the earlier rating-sort plan, this is a genuine DB-level
  pagination win from day one, since walk time is already a real column.
- Open questions: reflect filters/sort in the URL for shareable links;
  whether the `needs_review` queue eventually needs the same pagination.

---

## Pending topics
_(none currently — see individual docs' "Open questions" sections for
unresolved details within already-scoped features)_
