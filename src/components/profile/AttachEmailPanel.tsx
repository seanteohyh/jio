"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "../ui";

interface AttachEmailPanelProps {
  onAttached: () => void;
}

/**
 * "Attach a permanent email" — the durable-identity upgrade for a name-mode
 * anonymous session (see lib/auth/index.ts). Same session, same history,
 * just no longer bound to this one browser once it's confirmed.
 *
 * Deliberately not shown at all unless the current deployment supports it
 * and the current user doesn't already have an email — the parent decides
 * that, this component just renders the two-step send-code / verify-code
 * flow, mirroring the login page's email form.
 */
export default function AttachEmailPanel({ onAttached }: AttachEmailPanelProps) {
  const [open, setOpen] = useState(false);
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
      const response = await fetch("/api/auth/attach-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
      const response = await fetch("/api/auth/attach-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onAttached();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-dolch-accent text-sm underline"
        >
          Attach an email to this account
        </button>
        <p className="text-dolch-muted mt-1 text-xs">
          You&apos;re signed in on this browser only right now — clearing site
          data or switching devices means starting over with no history.
          Attaching an email keeps everything and lets you sign back in from
          anywhere.
        </p>
      </div>
    );
  }

  if (stage === "email") {
    return (
      <form onSubmit={sendEmail} className="space-y-3">
        <Field
          label="Email"
          hint="We'll send a confirmation link and a 6-digit code. Your history stays exactly as it is."
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

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Sending…" : "Send me a code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-3">
      <p className="text-dolch-muted text-sm">
        Check <span className="text-dolch-text font-medium">{email}</span>.
        Tap the link, or type the 6-digit code here.
      </p>

      <Field label="Code">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
          placeholder="000000"
          autoComplete="one-time-code"
          autoFocus
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Confirm"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStage("email");
            setCode("");
            setError(null);
          }}
          disabled={busy}
        >
          Use a different email
        </Button>
      </div>
    </form>
  );
}
