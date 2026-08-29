"use client";

import { useState } from "react";
import { AddSquareIcon, PhoneIcon, ShareIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { useInstallPrompt } from "@/components/InstallPromptProvider";

/**
 * The always-there counterpart to `AddToHomeScreenPrompt` — for whoever
 * dismissed or snoozed the auto-prompt but decides later they do want it
 * after all. Shares the same captured `beforeinstallprompt` event via
 * `useInstallPrompt`, so "Install" here works even without the banner ever
 * having shown this session.
 *
 * Renders nothing once already installed, and nothing on a platform with no
 * reliable install path (desktop Firefox, etc.) — same as the auto-prompt,
 * for the same reason: a button that can't do anything is worse than no
 * button.
 *
 * No own `Card` wrapper by default (CHANGES_20260816.md §3) — on `/profile`
 * this is grouped with the page's other personal-account rows inside one
 * shared card there, not a standalone card of its own. `standalone` (Home,
 * CHANGES_20260819.md §1) wraps it in one — a bare row would otherwise sit
 * unbordered on the page background with nothing else grouping it. The
 * suppression checks above still run first either way, so a wrapping Card
 * never renders empty.
 */
export default function AddToHomeScreenCard({
  standalone: standaloneCard,
}: {
  standalone?: boolean;
}) {
  const { platform, standalone, install } = useInstallPrompt();
  const [installed, setInstalled] = useState(false);

  if (standalone || installed || !platform) return null;

  const handleInstall = async () => {
    const outcome = await install();
    if (outcome === "accepted") setInstalled(true);
  };

  const row = (
    <div className="flex items-start gap-3">
      <span className="bg-ember-tint text-ember flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <PhoneIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">Add to home screen</p>
        {platform === "ios" ? (
          <p className="text-stone mt-1 text-xs">
            Tap{" "}
            <ShareIcon
              className="mx-0.5 inline h-3.5 w-3.5 -translate-y-px"
              strokeWidth={1.75}
              aria-hidden="true"
            />{" "}
            Share (look for <span aria-hidden="true">•••</span> or "More"
            first if you don't see it), then{" "}
            <AddSquareIcon
              className="mx-0.5 inline h-3.5 w-3.5 -translate-y-px"
              strokeWidth={1.75}
              aria-hidden="true"
            />{" "}
            Add to Home Screen. Notifications below only work once it's
            installed this way.
          </p>
        ) : (
          <>
            <p className="text-stone mt-1 text-xs">
              Launches like a real app, and it's what notifications need to
              actually reach you.
            </p>
            <Button size="sm" className="mt-3" onClick={handleInstall}>
              Install
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return standaloneCard ? <Card>{row}</Card> : row;
}
