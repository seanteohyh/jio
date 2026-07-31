"use client";

import { useState } from "react";
import { Button, Card } from "../ui";
import JioForm from "@/components/events/JioForm";

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
export default function StartJioWizard() {
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

      <JioForm variant="inline" onCancel={() => setOpen(false)} />
    </Card>
  );
}
