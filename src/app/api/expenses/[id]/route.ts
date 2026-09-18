import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import type { ExpenseCategory } from "@/types";

type Params = { params: Promise<{ id: string }> };

const CATEGORIES: ExpenseCategory[] = [
  "breakfast",
  "lunch",
  "dinner",
  "coffee",
  "snack",
  "other",
];

interface UpdateExpenseBody {
  amount_cents?: number;
  label?: string;
  category?: string;
  logged_at?: string;
  place_id?: string | null;
}

/**
 * Amend one of your own entries — added per confirmed decision (delete-only
 * was the doc's original scope; edit was chosen instead, so a typo'd amount
 * or mis-tapped category doesn't need the entry deleted and re-added).
 * `place_id` is editable too — the same search-with-freeform-fallback on
 * "What was it?" the create path has also runs on an edit, so a match
 * found (or cleared) while editing needs somewhere to go. `source_visit_id`
 * stays off the whitelist — that link is set once, at creation, only ever
 * by the merged convenience path on the rating form, same reasoning
 * `updateVisit` keeps `user_id` off its own whitelist.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    const body = await readJson<UpdateExpenseBody>(request);

    if (!body) return badRequest("That didn't save — mind trying again?");

    if (body.amount_cents !== undefined && body.amount_cents <= 0) {
      return badRequest("Put in an amount");
    }
    if (body.label !== undefined && !body.label.trim()) {
      return badRequest("What was it for?");
    }
    if (
      body.category !== undefined &&
      !CATEGORIES.includes(body.category as ExpenseCategory)
    ) {
      return badRequest("Pick a category");
    }

    const entry = await repo.updateExpenseEntry(user.id, id, {
      amountCents: body.amount_cents,
      label: body.label?.trim(),
      category: body.category as ExpenseCategory | undefined,
      loggedAt: body.logged_at,
      placeId: "place_id" in body ? (body.place_id ?? null) : undefined,
    });

    return json({ entry });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();
    await repo.deleteExpenseEntry(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
