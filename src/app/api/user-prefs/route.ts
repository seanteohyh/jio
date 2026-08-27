import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import type { BudgetTier, UserPrefs } from "@/types";

export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const prefs = await repo.getUserPrefs(user.id);
    return json({ prefs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<Partial<UserPrefs>>(request);

    if (!body) return badRequest("Expected a JSON body");

    // A caller (Taste preferences, or the Notifications panel) only ever
    // sends the fields it owns, so a field missing from the body has to
    // fall back to whatever's already saved, not to a bare default — the
    // route used to always send the full object itself, but now that two
    // independent callers PUT here, defaulting an absent field to "empty"
    // would silently wipe out whatever the other caller last saved.
    const existing = await repo.getUserPrefs(user.id);

    const budgetMin = (
      "budget_min" in body ? body.budget_min : existing?.budget_min
    ) ?? 1;
    const budgetMax = (
      "budget_max" in body ? body.budget_max : existing?.budget_max
    ) ?? 6;
    if (budgetMin > budgetMax) {
      return badRequest("Minimum budget cannot exceed the maximum");
    }

    const reminderLeadMinutes =
      ("reminder_lead_minutes" in body
        ? body.reminder_lead_minutes
        : existing?.reminder_lead_minutes) ?? 30;
    if (
      typeof reminderLeadMinutes !== "number" ||
      !Number.isFinite(reminderLeadMinutes) ||
      reminderLeadMinutes <= 0
    ) {
      return badRequest(
        "Reminder lead time must be a positive number of minutes"
      );
    }

    const prefs = await repo.upsertUserPrefs({
      user_id: user.id,
      cuisine_likes:
        "cuisine_likes" in body
          ? (body.cuisine_likes ?? [])
          : (existing?.cuisine_likes ?? []),
      cuisine_dislikes:
        "cuisine_dislikes" in body
          ? (body.cuisine_dislikes ?? [])
          : (existing?.cuisine_dislikes ?? []),
      budget_min: budgetMin as BudgetTier,
      budget_max: budgetMax as BudgetTier,
      blocklist:
        "blocklist" in body
          ? (body.blocklist ?? [])
          : (existing?.blocklist ?? []),
      default_office_id:
        "default_office_id" in body
          ? (body.default_office_id ?? null)
          : (existing?.default_office_id ?? null),
      reminders_enabled:
        "reminders_enabled" in body
          ? (body.reminders_enabled ?? true)
          : (existing?.reminders_enabled ?? true),
      reminder_lead_minutes: reminderLeadMinutes,
    });

    return json({ prefs });
  } catch (error) {
    return errorResponse(error);
  }
}
