"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";
import { config } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";
import JioLockup from "@/components/brand/JioLockup";

/**
 * Sign in.
 *
 * In the default `name` mode this is one text field and one button. There is
 * no password to forget, no email to wait for, and no provider to configure —
 * the only thing being collected is what everyone should call you.
 *
 * The magic-link form below it is the same page in `email` mode. Both are kept
 * here so switching modes is an environment variable rather than a rewrite.
 */
function NameForm({ next }: { next: string }) {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a sign-in attempt comes back "an account with this exact name
  // already exists — is that you?" (CHANGES_20260807c.md §3 item 1). Holds
  // the matched account's exact stored name for the prompt's copy.
  const [pendingMatch, setPendingMatch] = useState<string | null>(null);

  const attempt = async (confirmClaim?: boolean) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name, confirm_claim: confirmClaim }),
      });
      const payload = await response.json();

      if (payload.needs_confirmation) {
        setPendingMatch(payload.matched_name ?? name);
        setBusy(false);
        return;
      }

      if (payload.name_taken) {
        // CHANGES_20260818.md §2 — "No, different person" no longer signs
        // in under a name someone else already has. Drop back to the plain
        // field rather than the confirm prompt, keep what they typed (the
        // collision itself is the useful context here), and say why.
        setPendingMatch(null);
        setError(
          `"${payload.matched_name ?? name}" is already in use — try a ` +
            "different name so your teammates can tell you apart."
        );
        setBusy(false);
        // The name field isn't mounted yet — it's still showing the confirm
        // prompt this click came from — so focus has to wait for that state
        // flip to actually render before the node exists to focus.
        setTimeout(() => nameInputRef.current?.focus(), 0);
        return;
      }

      if (!response.ok) throw new Error(payload.error);

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await attempt(undefined);
  };

  if (pendingMatch) {
    return (
      <div className="space-y-4">
        <p className="text-ink text-sm">
          An account named{" "}
          <span className="font-medium">&ldquo;{pendingMatch}&rdquo;</span>{" "}
          already exists.
        </p>
        <p className="text-stone text-xs">
          Is this you? Say yes and everything under that name — your votes,
          your history — comes with you.{" "}
          <span className="text-ink font-medium">
            If that account is currently signed in anywhere else (another
            tab, a home-screen icon on another device), saying yes signs it
            out there
          </span>{" "}
          — it doesn't stay in sync, it moves. Say no and you sign in as a
          different person who happens to share the name.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={() => attempt(true)}
          >
            {busy ? "One moment…" : "Yes, that's me"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => attempt(false)}
          >
            No, different person
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setPendingMatch(null);
            setError(null);
          }}
          className="text-stone w-full text-center text-xs underline"
        >
          Use a different name instead
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="What should people call you?"
        hint="This is what shows up next to your votes and reviews."
      >
        <input
          ref={nameInputRef}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Sean"
          autoComplete="nickname"
          maxLength={40}
          autoFocus
        />
      </Field>

      {/*
        The office used to be shown on /welcome, one screen later. It carries
        no input — it is a locked label — so folding it in here costs nothing
        and lets name-mode sign-in be the only screen a new user sees.
      */}
      <Field label="Office">
        <input
          value={DEFAULT_OFFICE.name}
          disabled
          className={`${inputClass} cursor-not-allowed opacity-70`}
        />
        <p className="text-stone mt-1 text-xs">
          This pilot only supports one office for now.
        </p>
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {busy ? "One moment…" : "Start eating"}
      </Button>

      <p className="text-stone text-xs">
        No password, no email. You stay signed in on this browser — use the same
        one and you keep your history.
      </p>
    </form>
  );
}

function EmailForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work");
      setBusy(false);
    }
  };

  if (stage === "email") {
    return (
      <form onSubmit={sendEmail} className="space-y-3">
        <Field
          label="Email"
          hint="We'll send a sign-in link and a 6-digit code. No password to remember."
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send me a code"}
        </Button>

        {!config.openSignup && (
          <p className="text-stone text-xs">
            Sign-up is closed — only existing members can get in.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-3">
      <p className="text-stone text-sm">
        Check <span className="text-ink font-medium">{email}</span>. Tap
        the link, or type the 6-digit code here.
      </p>

      <Field label="Code">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
          placeholder="000000"
          autoComplete="one-time-code"
          autoFocus
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button
        type="submit"
        className="w-full"
        disabled={busy || code.length !== 6}
      >
        {busy ? "Checking…" : "Sign in"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setStage("email");
          setCode("");
          setError(null);
        }}
        className="text-stone w-full text-center text-xs underline"
      >
        Use a different email
      </button>
    </form>
  );
}

function LoginBody() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const urlError = params.get("error");

  const mode = config.authAdapter;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center">
      <div className="mb-8 flex flex-col items-center text-center">
        <JioLockup size="lg" />
        <p className="text-stone mt-3 text-sm">
          Find, decide on and share lunch near the office.
        </p>
      </div>

      <Card className="space-y-4">
        {urlError && <ErrorNote>{urlError}</ErrorNote>}

        {mode === "demo" && (
          <p className="text-stone text-sm">
            Demo mode — there is no real sign-in. Put in a name and carry on.
          </p>
        )}

        {mode === "email" ? <EmailForm next={next} /> : <NameForm next={next} />}
      </Card>

      <p className="text-stone mt-6 text-center text-xs">
        Runs on free tiers. No tracking, no ads.
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <LoginBody />
    </Suspense>
  );
}
