"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";

/**
 * A one-line, dismissible hint shown once per page on a user's first visit
 * to it — CHANGES_20260819.md §3. Deliberately not a tour: no sequence, no
 * "next," no modal, nothing that blocks — `/welcome`'s own "deliberately a
 * single field, not a wizard" stance is the app's existing case against
 * onboarding friction, and a multi-step walkthrough would cut against it
 * directly. Just a small contextual card in the one place it's relevant,
 * gone for good once dismissed.
 *
 * Tracked the same way `AddToHomeScreenPrompt` tracks visits — a
 * localStorage flag, `jio-hint-<page>-seen`, no backend involved. Not the
 * same mechanism as that banner: this is per-page and one-time rather than
 * global and count-gated, so the two can coexist without conflicting.
 */
export default function HintCard({
  page,
  icon,
  children,
}: {
  /** Unique key for this page's dismiss flag, e.g. "home". */
  page: string;
  /** A single emoji, shown in the ember-tint icon circle. */
  icon: string;
  children: React.ReactNode;
}) {
  const storageKey = `jio-hint-${page}-seen`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.localStorage.getItem(storageKey)) setVisible(true);
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  return (
    <div className="border-line bg-cream flex items-start gap-3 rounded-xl border p-3">
      <span
        className="bg-ember-tint flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-ink min-w-0 flex-1 text-sm">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-stone hover:text-ink shrink-0 p-0.5"
      >
        <CloseIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
