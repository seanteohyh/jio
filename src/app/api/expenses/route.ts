import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { currentMonthKey } from "@/lib/expenses";
import { logAction } from "@/lib/actions";
import type { ExpenseCategory } from "@/types";

const CATEGORIES: ExpenseCategory[] = ["lunch", "coffee", "snack", "other"];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const month = params.get("month") ?? currentMonthKey();
    if (!MONTH_PATTERN.test(month)) return badRequest("Bad month");

    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

    const [summary, { entries, totalCount }] = await Promise.all([
      repo.getExpenseMonthSummary(user.id, month),
      repo.listExpenseEntries(user.id, month, page, PAGE_SIZE),
    ]);

    return json({ summary, entries, page, pageSize: PAGE_SIZE, totalCount });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateExpenseBody {
  amount_cents?: number;
  label?: string;
  category?: string;
  place_id?: string | null;
  source_visit_id?: string | null;
  logged_at?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreateExpenseBody>(request);

    if (!body) return badRequest("That didn't save — mind trying again?");
    if (!body.amount_cents || body.amount_cents <= 0) {
      return badRequest("Put in an amount");
    }
    if (!body.label?.trim()) return badRequest("What was it for?");
    if (!body.category || !CATEGORIES.includes(body.category as ExpenseCategory)) {
      return badRequest("Pick a category");
    }

    const entry = await repo.createExpenseEntry(user.id, {
      amountCents: body.amount_cents,
      label: body.label.trim(),
      category: body.category as ExpenseCategory,
      placeId: body.place_id ?? null,
      sourceVisitId: body.source_visit_id ?? null,
      loggedAt: body.logged_at,
    });

    await logAction(repo, user.id, "expense.logged", {
      entryId: entry.id,
      category: entry.category,
    });

    return json({ entry }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
