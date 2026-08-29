"use client";

import { useState } from "react";
import { Button, Card, LinkButton } from "../ui";
import JioForm from "@/components/events/JioForm";
import type { InviteSelection } from "@/components/InvitePicker";
import { features } from "@/lib/config";
import { formatTime } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/**
 * Home's three-state action block (UX review log #23), plus the "Start a
 * Jio" form it opens.
 *
 * The expanded `JioForm` used to render nested *inside* the ember block
 * (via `StartJioWizard`, now retired). Two real problems came from that,
 * not just one: `InvitePicker`'s plain-text name rows never set their own
 * colour — they inherit the page's ink by default — so nesting them under
 * the ember block's `text-white` made every name invisible against the
 * cream form card underneath. And a whole multi-field form is exactly the
 * kind of "calm-zone" content that doesn't belong on the action hero in
 * the first place — the same reasoning that keeps `JioMark` off the ember
 * block below. So the form now renders as its own card on the ordinary
 * page background, right after the hero, not inside it.
 */
export default function HomeHero({
  todaysJio,
  dateLine,
  decidedPlaceName,
  firstHostInvite,
}: {
  todaysJio: LunchEvent | undefined;
  dateLine: string;
  decidedPlaceName: string | null;
  firstHostInvite?: InviteSelection;
}) {
  const [open, setOpen] = useState(false);
  const voteOpen = !!todaysJio && todaysJio.status === "open";

  return (
    <>
      <div className="bg-ember rounded-2xl p-5 text-white">
        <p className="text-xs text-white/70">{dateLine}</p>
        <h1 className="font-display !text-white mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
          {todaysJio ? todaysJio.title : "What’s for lunch?"}
        </h1>

        {voteOpen ? (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <LinkButton
                href={`/events/${todaysJio!.id}`}
                variant="inverse"
                className="flex-1"
              >
                Cast your vote
              </LinkButton>
              <Button
                variant="outlineInverse"
                className="flex-1"
                onClick={() => setOpen(true)}
              >
                New Jio
              </Button>
            </div>
            {typeof todaysJio!.going_count === "number" &&
              todaysJio!.going_count > 0 && (
                <p className="mt-3 text-xs text-white/80">
                  {todaysJio!.going_count} going
                </p>
              )}
          </>
        ) : todaysJio ? (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {features.events && (
                <Button
                  variant="inverse"
                  className="flex-1"
                  onClick={() => setOpen(true)}
                >
                  Start a Jio
                </Button>
              )}
              <LinkButton
                href={`/events/${todaysJio.id}`}
                variant="outlineInverse"
                className="flex-1"
              >
                View
              </LinkButton>
            </div>
            {decidedPlaceName && (
              <p className="mt-3 text-xs text-white/80">
                {decidedPlaceName} · {formatTime(todaysJio.scheduled_at)}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {features.events && (
                <Button
                  variant="inverse"
                  className="flex-1"
                  onClick={() => setOpen(true)}
                >
                  Start a Jio
                </Button>
              )}
              {/* UX review log #6 — /suggest itself is retired; Places
                  carries the same personal picks now ("Quick & nearby,"
                  "New to try"), so that's where this now leads. */}
              <LinkButton
                href="/places"
                variant="outlineInverse"
                className="flex-1"
              >
                Just tell me where to go
              </LinkButton>
            </div>
            <p className="mt-3 text-xs text-white/80">
              Pick somewhere, or let the votes decide.
            </p>
          </>
        )}
      </div>

      {open && (
        <Card className="animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {voteOpen ? "New Jio" : "Start a Jio"}
            </h2>
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
            initialInvite={firstHostInvite}
          />
        </Card>
      )}
    </>
  );
}
