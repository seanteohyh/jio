# Office / Home / Hangout locations — design doc (shelved for next week)

**Status: not started.** This whole feature was designed and approved in
plan mode, then explicitly shelved before any implementation — a bigger,
separate change takes priority this week. The one commit that touched code
(`ae56588`, WIP types/interface only) was reverted (`95f09f7`); the branch
is back to a clean, fully-working state. Nothing below has been built.

This doc captures the full reasoning trail, not just the final spec, so
picking this back up doesn't mean re-deriving any of it.

---

## How this started

While fixing an unrelated bug (a newly-added place, "Joji's Deli," wasn't
showing up in Places or Map), the root cause turned out to be intentional
design, not a bug: both views filter by walking distance from the single
shared office (30 min default, 45 min hard ceiling), and the place was
genuinely too far away. The actual bug was that this happened silently —
fixed separately (already shipped, PR #37) by adding an explanatory note
on the place's own page.

That fix surfaced two real gaps, which is what this doc is about:

1. **Personal convenience** — wanting to browse/track places near your
   own home, which today is impossible since everything is measured from
   the office.
2. **Organizing a Jio with far-away friends** — meeting someone not near
   the office at all is currently blocked twice over: Places/Map hide
   anything past 45 min, and a Jio's own "find a place" search can't even
   locate anything past 60 min (a separate, server-side default).
3. A third case came up mid-discussion: **recurring group spots that
   aren't your literal home either** — a church, a mall, wherever a
   specific friend group actually meets on weekends, used repeatedly, by
   more than just one person.

## The design conversation, in order

**First framing (rejected):** should the walk-distance filter just be
extended/widened so everything shows up regardless of distance? No —
the filter is doing real curation work ("what's realistic for today's
team lunch"), and stretching it to show everywhere would flood that
shared list with irrelevant places, without solving case 2 anyway (a
friend elsewhere isn't on the team's roster regardless of distance).

**Second framing: private places with an admin-grant.** The original
idea was "secret locations only I can see, with an admin able to grant
specific people access." Refined through discussion:

- Should a shared spot (like a church, used with specific friends) be
  modeled by attaching a location to a **Kaki** (existing lunch-group
  concept), reusing its membership as the access list? **Rejected** —
  "don't want the whole church to be in a Kaki." A personal list with its
  own lightweight sharing was preferred instead of forcing a formal group.
- That in turn raised: if sharing a personal location, who can edit it —
  owner-only, or does everyone with access get edit rights too?
  Recommended (and never fully finalized, since the model changed again
  right after): owner-only edit, invited people get usage-only rights —
  matching this app's existing personal-invite-link pattern more than a
  Kaki's fully-symmetric membership.

**Final framing: three tiers, not two.** The distinction that actually
stuck, once "hangout zone" entered the conversation as its own named
concept:

| Tier | Visibility | Who can add/edit | How many |
|---|---|---|---|
| **Office** | Public | Admin-only — **already true today**, confirmed via `offices_insert`'s RLS policy (`017_admin_and_moderation.sql`) requiring `exists (select 1 from admins where user_id = auth.uid())`, plus `/api/offices` POST's own `isAdmin` check and an existing `/admin/offices` page. Nothing to change here. | One, for this pilot |
| **Home** | Private — hidden from everyone else, always, no exceptions, no admin override | Only you | One |
| **Hangout** | Public — anyone can see and select it, same as a Place | Anyone can add one; anyone can edit any zone, same "gatekeeping edits kills contribution" norm `places_update` already uses (not scoped to the creator) | Many, shared pool across everyone |

Two follow-up questions got resolved along the way:

- *Why does Office get admin-gating while Hangout doesn't — isn't that a
  contradiction?* No: the axis is **consent and blast radius**, not "is
  this a location." Office is the default nobody chose — a new user lands
  on it with zero setup, and (independent of the cron question below)
  creating one used to also commit real ongoing external-API cost via the
  discovery cron sweeping every office daily. It's also structurally
  load-bearing elsewhere (every Jio's own `office_id` column, admin
  analytics segmentation). A Hangout Zone only ever affects the one
  person who explicitly toggles to it — nobody's default view changes
  because someone added "Church."
- *Doesn't a Hangout Zone behave exactly like Office once active (shows
  what's nearby, computes distance)?* Yes — intentionally so, that's the
  whole "mini office" idea. The distinction was never about function, only
  about consent (opt-in vs. default-for-everyone) and who's allowed to
  create one.
- *Multi-team growth — if other companies/teams start using this app,
  won't they need their own offices too, without going through one global
  admin list?* Real question, deliberately **deferred**. Recommendation:
  don't solve it by loosening who can add an office — that would create a
  false sense of multi-tenancy (multiple companies' offices in one shared
  list, while every other part of the app — Kakis, Jios, the `admins`
  table itself — still pools everyone together with zero data isolation).
  Proper multi-tenancy (per-org users, admins, and probably per-org
  Kakis/Jios/analytics) is its own foundational initiative, orthogonal to
  this one — Home and Hangout are already per-*user* concepts that'll
  keep working unchanged whenever that eventually gets built.

**Bundled in, separately:** OSM-sourced auto-discovery (the daily cron
that sweeps Overpass for nearby places) has produced consistently poor
matches in practice. Decided to retire that specific job while keeping
the cron's *other* job — a trivial database ping that's the only thing
stopping this free-tier Supabase project from auto-pausing after 7 days
idle (confirmed still a real constraint: this is on the free tier).
Manual add (already open to anyone) and blog import (already its own
independent route) are the "bottom up" replacement.

**Staged rollout — the last decision before shelving:** for this first
pass, the *entire* Home/Hangout system, including the toggle itself, is
admin-only — enforced at both the UI and API layers, not just hidden in
the client. A regular user's Places/Map/Jio-search experience is meant to
be completely unaffected by any of this landing, until there's a decision
to roll it out wider. Purpose: try it out live first, decide later.

---

## The approved technical plan

### Data model

New migration (`069_home_and_hangout_locations.sql` in the shelved work;
renumber to whatever's next when resumed):

```sql
create table if not exists hangout_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  created_by uuid not null,
  created_at timestamptz default now()
);

alter table hangout_zones enable row level security;

create policy "hangout_zones_select" on hangout_zones
  for select to authenticated using (true);
create policy "hangout_zones_insert" on hangout_zones
  for insert to authenticated with check (created_by = auth.uid());
create policy "hangout_zones_update" on hangout_zones
  for update to authenticated using (true) with check (true);

alter table user_prefs
  add column if not exists location_mode text not null default 'office'
    check (location_mode in ('office', 'home', 'hangout')),
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists home_address text,
  add column if not exists active_hangout_zone_id uuid references hangout_zones(id);
```

`user_prefs` is already strictly owner-scoped RLS
(`using (user_id = auth.uid())`) — exactly right for Home, no new RLS
work there. No column-level grant needed either (unlike `profiles`) —
`getUserPrefs` already does a plain `select("*")`.

### Write-time validation (`PUT /api/user-prefs`)

Same field-preserving upsert pattern already there. `location_mode:
'home'` requires `home_lat`/`home_lng` resolved (just-sent or
already-saved) or the write is rejected; `location_mode: 'hangout'`
requires `active_hangout_zone_id` resolved or rejected. Enforcing this at
write time means every *read* site can trust `location_mode` alone — no
silent-fallback logic needed elsewhere.

### Read path: reference-point resolution

`enrich()` (`demoRepo.ts`) and `walkTimes()` (`supabaseRepo.ts`) both
currently take `officeId: string` (with `walkTimes` checking the
precomputed `walk_cache` table first, falling back to a haversine
estimate). Widen to `string | { lat: number; lng: number }`:
- String → today's exact behavior, cache included, unchanged.
- Object (home/hangout coords) → skip `walk_cache` entirely, always
  haversine. No new cache rows, no OneMap routing calls added — cheap and
  correct for these lower-traffic paths.

Only `listPlaces()` needs to resolve and pass the right object; every
other call site (`getPlace`, event-option enrichment, a Jio's own
`office_id` column) is untouched.

`Filters` gets one new optional field: `activeLocation?: { lat, lng } |
null`. `GET /api/places` resolves this once, right after `requireUser()`,
from the caller's *own* `user_prefs` — never a client-supplied value.
Because of that, **JioForm's existing search call needs zero changes** to
also respect the active mode — the route being mode-aware is enough.

**Explicitly out of scope:** `/api/suggest` (`recommend.ts`'s
personalized scoring) stays office-relative — a deliberately separate,
bigger system left alone for this pass.

### New repo methods

`listHangoutZones(search?)`, `createHangoutZone(userId, {name, address,
lat, lng})`, `updateHangoutZone(id, patch)` — the last one open to any
signed-in user, matching `places`'s existing norm, not scoped to the
creator. New routes: `GET/POST /api/hangout-zones`, `PUT
/api/hangout-zones/[id]`.

### The toggle + zone picker

A three-way segmented control (Office / Home / Hangout — same visual
pattern as the existing Calendar/List toggle on Jios), plus — only when
Hangout is selected — a `<select>` of available zones (same pattern as
the existing budget-tier dropdown). Lives inside `FilterBar` (shared by
Places and Map). "Home" disabled with a hint if no address saved yet;
"Hangout" disabled with a hint if no zones exist yet, with a "+ Add a
hangout zone" entry in its picker. Any change does `PUT /api/user-prefs`
then the parent page's own SWR `mutate()` on `/api/places`.

### New forms

Both the Home address field and Hangout Zone creation need the same
address-or-postal-code-or-GPS resolution already built in `PlaceForm.tsx`
— worth extracting into a shared `useAddressToCoords` hook rather than
duplicating a third time. New components: `HomeLocationPanel.tsx` (Profile
card — address field, "use my location," Save/Clear; Clear also forces
`location_mode` back to `'office'`) and `HangoutZonesPanel.tsx` (Profile
card — list of zones, add/edit form).

### Map page

`MapView` already takes a generic `office`-shaped prop
(`{id, name, lat, lng}`), used for both centering and as the "from" point
in the walking-route fetch — zero `MapView`/`/api/route` changes needed.
`map/page.tsx` just builds a synthetic object from whichever reference
point is active and passes that instead.

### Bundled: trim the discovery cron

`src/app/api/cron/discover/route.ts` currently does two jobs: (1) sweep
Overpass into `needs_review`, (2) touch the database to prevent
auto-pause. Strip out (1) entirely, keep only (2) — same schedule.
`needs_review` as a status, and its moderation UI, stay as-is; nothing
currently routes into that state once OSM discovery stops, but a place
could still land there in the future without any code changes needed.

### Staged rollout enforcement (admin-only gate)

Same template as `/api/offices` POST (`isAdmin` check, `forbidden()` on
failure), applied at both layers:

- **UI**: the toggle in `FilterBar`, and both new Profile panels, only
  render when the signed-in user's own `is_admin` is true.
- **API**: `PUT /api/user-prefs` rejects `location_mode` != `'office'` or
  any `home_*`/`active_hangout_zone_id` field from a non-admin. `POST`/
  `PUT /api/hangout-zones` are admin-only for now (expected to relax to
  "anyone" later — the gate is about staging the rollout, not a
  permanent restriction on who Hangout is meant for). `GET /api/places`
  only resolves `activeLocation` for an admin caller — a non-admin's
  experience can't change even if a stray preference value existed.

### Files touched (for when this resumes)

- `supabase/migrations/0XX_home_and_hangout_locations.sql` — new
- `src/types/index.ts` — `HangoutZone`, `UserPrefs` fields, `Filters.activeLocation`
- `src/lib/data/index.ts` — `Filters` field, hangout-zone repo methods
- `src/lib/data/demoRepo.ts` — new store array + methods; `enrich()` widen
- `src/lib/data/supabaseRepo.ts` — new methods; `walkTimes()` widen
- `src/app/api/hangout-zones/route.ts`, `src/app/api/hangout-zones/[id]/route.ts` — new
- `src/app/api/user-prefs/route.ts` — new fields + validation + admin gate
- `src/app/api/places/route.ts` — resolve caller's active reference point, admin-gated
- `src/components/FilterBar.tsx` — the three-way toggle + zone picker (admin-only render)
- `src/app/map/page.tsx` — synthetic active-location object
- `src/components/places/PlaceForm.tsx` — extract shared `useAddressToCoords` hook
- `src/components/profile/HomeLocationPanel.tsx`, `HangoutZonesPanel.tsx` — new, admin-only
- `src/app/profile/page.tsx` — wire in both new panels
- `src/app/api/cron/discover/route.ts` — strip Overpass sweep, keep the keep-alive query only

### Verification plan

- `npm run typecheck`, `npm test` (existing suite must stay green)
- New unit tests: `listPlaces` honors `activeLocation` over `officeId`;
  `/api/user-prefs` rejects `'home'`/`'hangout'` modes missing supporting
  data; Clear resets mode to `'office'`; any signed-in user can edit any
  hangout zone but only the creator's own id is checked on insert; the
  trimmed discover cron still succeeds with no Overpass call.
- Admin-gate-specific tests: a non-admin's relevant `user-prefs`/
  `hangout-zones` writes are rejected; a non-admin's `GET /api/places`
  ignores `activeLocation` even with a stray `location_mode: 'home'` row.
- Regression-check new tests fail without the implementation first
  (standard practice this whole engagement).
- Live Playwright verification: create a hangout zone and a home address
  (GPS-mocked), toggle through all three modes on Places/Map, start a Jio
  and confirm its place-search follows the active mode, confirm a second
  user can select/edit the first user's zone but never see their Home.
- README.md updated per its own standing rule.
