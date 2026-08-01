import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { DEFAULT_OFFICE } from "@/lib/constants";

export async function GET() {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const series = await repo.listRecurringSeries(user.id);
    return json({ series });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateSeriesBody {
  title?: string;
  office_id?: string;
  kaki_id?: string | null;
  invitee_ids?: string[];
  weekday?: number;
  time_of_day?: string;
  mode?: "vote" | "fixed";
  fixed_place_id?: string | null;
  option_place_ids?: string[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Create a standing weekly Jio. Membership isn't expanded here the way a
 * one-off event's `kaki_ids` are — a series stores `kaki_id` and expands it
 * against *current* membership every time an occurrence generates, not
 * once at series-creation time. See 031_recurring_series.sql.
 */
export async function POST(request: NextRequest) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateSeriesBody>(request);

    if (!body) return badRequest("Expected a JSON body");
    const title = body.title?.trim() || "Lunch";

    if (
      typeof body.weekday !== "number" ||
      body.weekday < 0 ||
      body.weekday > 6
    ) {
      return badRequest("Which day of the week?");
    }
    if (!body.time_of_day || !TIME_RE.test(body.time_of_day)) {
      return badRequest("What time?");
    }
    if (body.mode !== "vote" && body.mode !== "fixed") {
      return badRequest("Pick a mode");
    }
    if (body.mode === "fixed" && !body.fixed_place_id) {
      return badRequest("Which place is this always at?");
    }
    if (body.mode === "vote" && (body.option_place_ids?.length ?? 0) === 0) {
      return badRequest("Pick at least one place to vote on each time");
    }

    const series = await repo.createRecurringSeries({
      host_id: user.id,
      title,
      office_id: body.office_id ?? DEFAULT_OFFICE.id,
      kaki_id: body.kaki_id ?? null,
      invitee_ids: (body.invitee_ids ?? []).filter((id) => id !== user.id),
      weekday: body.weekday,
      time_of_day: body.time_of_day,
      mode: body.mode,
      fixed_place_id: body.mode === "fixed" ? body.fixed_place_id : null,
      option_place_ids: body.mode === "vote" ? (body.option_place_ids ?? []) : [],
    });

    return json({ series }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
