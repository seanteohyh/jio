"use client";

import { useState } from "react";
import { useInstallPrompt } from "./InstallPromptProvider";
import { HomeIcon, CloseIcon } from "@/components/icons";
import { config } from "@/lib/config";

/**
 * Shown on a signed-out preview (`/e/[token]`, `/l/[token]`) reached from
 * outside the app — a shared link tapped in WhatsApp/Telegram, most often.
 * iOS gives no way to hand a tapped link off to an installed home-screen
 * icon (that's Universal Links, native-app-only), so the best available fix
 * is asking plainly rather than routing automatically: if the icon's
 * already there, it's a separate, already-signed-in session on iOS — using
 * it instead of whatever browser this link opened in skips a repeat
 * sign-in entirely. `platform === "ios"` only: Android/desktop installs
 * share cookies with their installing browser, so this repeat-login problem
 * — and this nudge — doesn't apply there.
 */
export default function HomeScreenNudge() {
  const { platform, standalone } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || standalone || platform !== "ios") return null;

  return (
    <div className="border-ember/40 bg-ember-tint text-ember-tint-text flex items-start gap-3 rounded-xl border p-3 text-sm">
      <HomeIcon
        className="mt-0.5 h-5 w-5 shrink-0"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Already added {config.appName} to your Home Screen?
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Skip this browser — open the icon there instead. That picks up
          signed in, right where you left off.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 p-1 opacity-70 hover:opacity-100"
      >
        <CloseIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
