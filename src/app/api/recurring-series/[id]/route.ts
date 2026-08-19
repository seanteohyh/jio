import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

interface UpdateSeriesBody {
  title?: string;
  invitee_ids?: string[];
  kaki_id?: string | null;
  weekday?: number;
  time_of_day?: string;
  mode?: "vote" | "fixed";
  fixed_place_id?: string | null;
  option_place_ids?: string[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Edit a standing weekly Jio — CHANGES_20260819b.md §3. The edit form
 * resubmits the full field set (same shape `POST /api/recurring-series`
 * takes, same validation here), not a sparse delta.
 *
 * Also propagates onto any of this series' already-generated occurrences
 * still `open` — see `updateRecurringSeries`'s doc comment for exactly what
 * moves and what's held back once someone's voted or RSVP'd.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<UpdateSeriesBody>(request);

    if (!body) return badRequest("Expected a JSON body");

    if (
      body.weekday !== undefined &&
      (typeof body.weekday !== "number" || body.weekday < 0 || body.weekday > 6)
    ) {
      return badRequest("Which day of the week?");
    }
    if (body.time_of_day !== undefined && !TIME_RE.test(body.time_of_day)) {
      return badRequest("What time?");
    }
    if (
      body.mode !== undefined &&
      body.mode !== "vote" &&
      body.mode !== "fixed"
    ) {
      return badRequest("Pick a mode");
    }
    if (body.mode === "fixed" && !body.fixed_place_id) {
      return badRequest("Which place is this always at?");
    }
    if (body.mode === "vote" && (body.option_place_ids?.length ?? 0) === 0) {
      return badRequest("Pick at least one place to vote on each time");
    }

    const series = await repo.updateRecurringSeries(id, user.id, {
      title: body.title?.trim() || undefined,
      invitee_ids: body.invitee_ids?.filter((uid) => uid !== user.id),
      kaki_id: body.kaki_id,
      weekday: body.weekday,
      time_of_day: body.time_of_day,
      mode: body.mode,
      fixed_place_id: body.mode === "fixed" ? body.fixed_place_id : undefined,
      option_place_ids:
        body.mode === "vote" ? body.option_place_ids : undefined,
    });

    return json({ series });
  } catch (error) {
    return errorResponse(error);
  }
}
