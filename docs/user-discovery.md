# User Discovery

> How users find each other as the user base grows past a single trusted team.
> Written 2026-07-31. Stage 1 ("Now") is specified for implementation; later
> stages are sketched deliberately, not designed.

---

## 1. The problem

Today every user can see every other user, and the list is short enough that
this works. Two things break it as the base grows:

1. **Finding someone you already know gets slow.** The invite picker is an
   unordered, unsearchable list. At 50 users it's annoying; at 200 it's
   unusable.
2. **Seeing everyone stops being appropriate.** A flat global list is a
   privacy posture, not just a UI, and it's the wrong one once "everyone" is
   no longer "my team."

These are separate problems with separate answers, and conflating them is the
main design risk here. Stage 1 solves the first and contains the second.

---

## 2. The governing constraint: identity

**Discovery is downstream of the auth model.** What's safe to expose depends
entirely on whether we can prove who someone is.

In `name` mode, identity is a browser-bound Supabase anonymous session and
anyone can type anyone's name. There is no verification. So a searchable
directory of names is also an impersonation surface — a row reading
"Sean Teoh" carries no evidence that it is.

This is not an argument against `name` mode, which buys real zero-friction
signup. It's an argument that **a public directory and handles must wait for
`email` mode**, where a verified address (and eventually a domain) makes a
name mean something. That switch is already built and is one environment
variable plus SMTP.

Stage 1 therefore builds only discovery mechanisms that are safe without
verified identity.

---

## 3. What we are deliberately not building yet

### 3.1 A friends list

Rejected for now, for four reasons:

- **It duplicates Kakis.** Kakis are already a social primitive with
  membership, invite tokens and shared stats. A symmetric 1:1 friend edge
  creates a second overlapping graph, two permission surfaces to keep
  consistent, and a recurring "why are they in my kaki but not my friends"
  confusion.
- **Cold start is worse than today.** A new user with no friends sees nobody,
  which is a regression from the current flat list.
- **It's a real state machine.** Request, pending, accept, decline, block,
  unfriend — plus every screen needing to know which state applies.
- **It's a spam vector.** Now that push notifications exist (migration 025),
  unsolicited friend requests become unsolicited notifications.

Revisit only if §5's later stages leave a gap that Kakis plus co-attendance
genuinely don't cover.

### 3.2 Human-readable handles (`@seanteoh`)

Deferred to `email` mode. Handles invite squatting and impersonation exactly
because `name` mode can't verify anyone. Opaque tokens (§4.3) give the same
shareability with none of that exposure.

---

## 4. Stage 1 — Now (under ~50 users)

Three changes. None of them adds a new social graph.

### 4.1 Scope and filter `/api/users` — do this first

**This is a live issue, not a scaling concern.** `api/users/route.ts` is ~450
bytes and appears to return every user with no filtering and no scoping. That
is already more exposure than intended, and under PDPA it's worth treating as
a defect rather than a backlog item.

- Scope results to the caller's **office**. The schema has supported multiple
  offices since migration 001; discovery should never cross that boundary.
- Move filtering **server-side** — accept a query param rather than returning
  everything and filtering in the client.
- Return the minimum: id, display name, avatar. Not emails, not office
  metadata, not anything the picker doesn't render.

**Verify first:** confirm whether `profiles` actually carries an office
reference, or whether office membership is derived some other way. That
determines whether scoping is a `WHERE` clause or a small migration.

### 4.2 Rank the invite picker by co-attendance

**The key idea.** Most discovery in a lunch app isn't "find a stranger" — it's
"find the person I already eat with, quickly." That needs better *ordering*,
not a new primitive.

We already know who has been in a Jio with whom. That graph builds itself,
requires nothing of the user, and predicts who they want to invite better than
any friends list they'd actually maintain.

This is the same principle as the recommendation engine: we don't ask users to
declare their cuisine preferences, we learn from what they rate. Apply it to
people instead of places.

**Tiers, in order:**

| Tier | Who | How ordered |
|---|---|---|
| 1 | People you've shared a Jio with | Frequency × recency decay |
| 2 | Members of your Kakis, not already in tier 1 | Kaki name, then display name |
| 3 | Everyone else in your office | Search only — not listed by default |

**Scoring tier 1.** Sum over shared events of `exp(-days_ago / half_life)`,
half-life around 30 days. Someone you ate with twice last week outranks
someone you ate with ten times last year, which matches how team composition
actually drifts.

Put the constants in a config file mirroring `recommendConfig.ts`, so the
behaviour is tunable in one place rather than embedded in a query.

**Cold start.** A brand-new user has no tier 1. They fall through to tier 2
(their Kakis, if they joined via an invite link) and then to search. This is
no worse than today's flat list and gets better after their first Jio — which
is the bootstrap story §4.3 completes.

**Performance.** The naive query joins `event_invitees` to `events` and back.
Fine at this scale with an index on `event_invitees(user_id, event_id)`. If it
becomes hot, the escalation path is the pattern already used for place ratings
(migration 021): a trigger-maintained table recomputing a pair's co-attendance
on event close. **Don't build that yet** — it's the documented next step, not
the starting point.

### 4.3 Personal invite link and QR code

A per-user token at `/u/<token>`, reusing the pattern already established by
`/e/<token>` for Jios and `/k/<token>` for Kakis. No new concept for users or
for the codebase.

**What opening it does:** shows that person's profile card with two actions —
*Start a Jio with them* and *Add them to a Kaki*. Deliberately **not** "add as
friend." No edge is created by viewing the link.

**Why that's enough.** The personal link is the *bootstrap*; co-attendance is
the *sustain*. You share your link once, the two of you have one Jio together,
and from then on §4.2 puts each of you near the top of the other's picker
automatically. Discovery becomes self-maintaining after a single interaction,
with no list for anyone to curate.

**QR code.** Render the same token as a QR on the profile page. The real
context here is an office — the person is across the room, not across the
internet. A QR beats any search box for that, and it's the same token, so it's
a rendering concern only.

**Token properties:** unguessable, not enumerable, regenerable from the
profile page if someone wants to invalidate an old share.

---

## 5. Later stages — sketched, not designed

### 5.1 Around 50–200 users

- **Opt-in discoverability.** A profile flag controlling whether you appear in
  office search at all. Cheap to add and it's what makes a directory
  defensible under PDPA.
- **Exact-match search only.** Requiring a full name match rather than prefix
  matching prevents enumerating the user base by typing single letters.
- Co-attendance ranking should still be carrying most of the load by here.

### 5.2 Beyond that, or cross-company

- **Switch to `email` mode.** Verified addresses give real identity.
- **Domain-based office assignment.** An `@company.com` address auto-scopes a
  user to the right office and verifies them in one step — this solves
  identity and discovery together.
- **Handles and a real directory** become safe only at this point.
- **Friends** — reconsider here, if a gap remains. It probably won't.

---

## 6. Privacy posture

Three rules that should hold at every stage:

1. **Office is a hard boundary.** Discovery never crosses it without an
   explicit, deliberate feature decision.
2. **Return the minimum field set.** The picker needs a name and an avatar.
3. **No enumeration.** Tokens are unguessable; search doesn't accept prefixes
   broad enough to walk the directory.

Singapore context: PDPA makes the exposure in §4.1 worth fixing on its own
merits, independent of scale.

---

## 7. Relationship to other work

- **§4 of `CHANGES_20260731.md`** (unified invite picker) is where §4.2's
  ranking lands. These should be built together — the picker is the surface,
  the ranking is its content. Building the picker with an unordered list means
  revisiting it immediately.
- **`/api/users` server-side search** is already noted there as §4c. §4.1 here
  extends it with office scoping and field minimisation.
- **Migration 019's snapshot decision** (kaki members expanded at send time)
  applies to tier 2: read current membership for *ranking*, but invites still
  snapshot.

---

## 8. Open questions

- Does `profiles` carry an office reference today, or is office membership
  derived? Determines whether §4.1 needs a migration.
- Should tier 1 count *invited to the same Jio* or *actually attended*? RSVP
  and attendance are distinct; attendance is the truer signal but sparser.
- Should a closed Jio's participants be visible to each other beyond the
  event page — i.e. does co-attendance imply any ongoing visibility, or only
  ranking within the picker? Leaning: ranking only.
- Does regenerating a personal token need to invalidate anything else, or is
  it purely cosmetic?
- Half-life of 30 days is a guess. Worth revisiting against real data once
  there is any.
