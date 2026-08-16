# Getting Jio running

## 1. Unzip

`jio-app.zip` is in your Jio folder. Extract it there — you will get a `jio/`
folder alongside `jio.md`.

The git repository is already inside it, with the first commit made. Check with:

```powershell
cd C:\Users\Seant\Desktop\jio
git log --oneline
```

## 2. Install and run

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. It works immediately — no accounts, no keys, no
database. That is demo mode: 22 sample places, two invented teammates, one Jio
mid-vote.

> **On Windows PowerShell**, chain commands with `;` rather than `&&`.

If `npm install` complains that a version does not exist, the pinned majors are
in `package.json` — `npm install next@latest react@latest react-dom@latest`
will resolve it. See "A note on versions" below.

## 3. Check the tests

```powershell
npm test
npm run typecheck
```

261 tests. If these pass, the business logic is sound.

Note that `npm test` transforms TypeScript without checking it, so a green run
says nothing about whether the app compiles. Treat `typecheck` as the other
half of the gate, not an optional extra.

## 4. Put it on GitHub

```powershell
git remote add origin https://github.com/YOUR-USERNAME/jio.git
git push -u origin main
```

Create the empty repo on GitHub first (no README, no .gitignore — this repo has
both). `.env.local` is already gitignored, so you cannot commit credentials by
accident.

## 5. Make it real

Follow **Going live** in `README.md`. Roughly 20 minutes:

1. Create a Supabase project, run the 51 migrations in the SQL editor
2. Turn on **Authentication → Providers → Anonymous sign-ins**. This is the one
   dashboard toggle name-only sign-in needs, and the only thing that will make
   it fail with a confusing error if you miss it
3. Optionally register for OneMap for real walking distances
4. Deploy to Vercel, paste in the environment variables
5. Run the three seed scripts

No SMTP, no email provider, nothing to verify — that is only needed if you
later switch to magic-link mode.

---

## A note on versions

`package.json` pins the major versions the handoff document specified
(Next 16, React 19, Tailwind 4, Supabase JS 2). I could not verify those
resolve, because this build environment had no access to the npm registry —
so the code was written, type-checked and tested, but never installed.

If any package fails to resolve, install it at `@latest` and tell me what
version you got; the code targets the Next.js 15+ App Router conventions
(async `params`, async `cookies()`), which both 15 and 16 satisfy.

---

## Where to change things

| You want to… | Edit |
|---|---|
| Change how suggestions are weighted | `src/lib/recommendConfig.ts` |
| Turn a feature off | `NEXT_PUBLIC_JIO_DISABLED_FEATURES` in `.env.local` |
| Point at a different office | `NEXT_PUBLIC_JIO_OFFICE_*` in `.env.local` |
| Change the colours | The `@theme` block in `src/app/globals.css` |
| Swap the database | Write one file implementing `Repo`, add a case to `src/lib/data/repo.ts` |
| Swap authentication | Write one file implementing `AuthAdapter`, add a case to `src/lib/auth/adapter.ts` |
| Move from names to email sign-in | Set `NEXT_PUBLIC_JIO_AUTH_ADAPTER=email` (and configure SMTP) |
| Add a place by hand | `/places/new` in the app, or `scripts/manual-seed.json` |

---

## How sign-in works

Type your name, press the button, you're in. No email, no password, nothing to
verify. Everyone gets a distinct user, so votes and reviews are attributed and
you can tell who is who — which is all you asked for.

Two things worth knowing before you share the link:

- **Your identity lives in your browser.** Clear site data and you come back as
  a new person with an empty history. Your phone is a separate user from your
  laptop.
- **There is no secret, so anyone can type anyone's name.** Fine for a team
  that trusts each other; not a control you can rely on if that changes.

Both are fixed by one environment variable — `NEXT_PUBLIC_JIO_AUTH_ADAPTER=email`
switches to magic links, and existing users keep their ids and history because
both modes sit on the same table. That is the whole migration.
