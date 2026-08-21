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

    const budgetMin = (body.budget_min ?? 1) as BudgetTier;
    const budgetMax = (body.budget_max ?? 6) as BudgetTier;
    if (budgetMin > budgetMax) {
      return badRequest("Minimum budget cannot exceed the maximum");
    }

    const prefs = await repo.upsertUserPrefs({
      user_id: user.id,
      cuisine_likes: body.cuisine_likes ?? [],
      cuisine_dislikes: body.cuisine_dislikes ?? [],
      budget_min: budgetMin,
      budget_max: budgetMax,
      blocklist: body.blocklist ?? [],
      default_office_id: body.default_office_id ?? null,
    });

    return json({ prefs });
  } catch (error) {
    return errorResponse(error);
  }
}
