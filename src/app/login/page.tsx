"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";
import { config } from "@/lib/config";

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
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="What should people call you?"
        hint="This is what shows up next to your votes and reviews."
      >
        <input
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

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {busy ? "One moment…" : "Start eating"}
      </Button>

      <p className="text-dolch-muted text-xs">
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
          <p className="text-dolch-muted text-xs">
            Sign-up is closed — only existing members can get in.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-3">
      <p className="text-dolch-muted text-sm">
        Check <span className="text-dolch-text font-medium">{email}</span>. Tap
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
        className="text-dolch-muted w-full text-center text-xs underline"
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
      <div className="mb-8 text-center">
        <h1 className="text-dolch-accent text-4xl font-semibold tracking-tight">
          {config.appName}
        </h1>
        <p className="text-dolch-muted mt-2 text-sm">
          Find, decide on and share lunch near the office.
        </p>
      </div>

      <Card className="space-y-4">
        {urlError && <ErrorNote>{urlError}</ErrorNote>}

        {mode === "demo" && (
          <p className="text-dolch-muted text-sm">
            Demo mode — there is no real sign-in. Put in a name and carry on.
          </p>
        )}

        {mode === "email" ? <EmailForm next={next} /> : <NameForm next={next} />}
      </Card>

      <p className="text-dolch-muted mt-6 text-center text-xs">
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
