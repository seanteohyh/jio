"use client";

import { useState } from "react";
import { Button, Card } from "../ui";
import JioForm from "@/components/events/JioForm";
import type { InviteSelection } from "@/components/InvitePicker";

/**
 * Start a Jio without leaving the home page.
 *
 * This used to be a cut-down three-field form of its own — no date, no
 * invitees, no place search — while /events/new had all of it. Two forms, one
 * of them quietly behind, and the difference read as a bug rather than as the
 * shortcut it was meant to be.
 *
 * It now renders the same `JioForm` the full page does. The only thing this
 * component still owns is the open/closed state: Home stays a home page until
 * you actually want to start something.
 */
export default function StartJioWizard({
  initialInvite,
}: {
  /**
   * CHANGES_20260821_combined2.md §3C — pre-checked co-attendees for a
   * first-ever hosting attempt. Computed server-side in Home's page.tsx
   * (only for an account that has never hosted before), so this stays
   * `undefined` for every hosting attempt after the first — same as
   * `initialInvite` being absent for a normal "Start a Jio" tap today.
   */
  initialInvite?: InviteSelection;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        Start a Jio
      </Button>
    );
  }

  return (
    <Card className="animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Start a Jio</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-stone text-sm underline"
        >
          Cancel
        </button>
      </div>

      <JioForm
        variant="inline"
        onCancel={() => setOpen(false)}
        initialInvite={initialInvite}
      />
    </Card>
  );
}
