import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import {
  badRequest,
  errorResponse,
  json,
  listParam,
  numberParam,
  readJson,
} from "@/lib/api";
import { DEFAULT_OFFICE } from "@/lib/constants";
import type { BudgetTier, Place, PlaceStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const params = request.nextUrl.searchParams;

    const places = await repo.listPlaces({
      cuisines: listParam(params, "cuisines"),
      budgetMin: numberParam(params, "budgetMin", 1) as BudgetTier,
      budgetMax: numberParam(params, "budgetMax", 4) as BudgetTier,
      maxWalkMinutes: numberParam(params, "maxWalk", 60),
      status: (params.get("status") as PlaceStatus | "all") ?? "active",
      search: params.get("q") ?? "",
      officeId: params.get("officeId") ?? DEFAULT_OFFICE.id,
    });

    return json({ places });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreatePlaceBody {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  cuisine?: string[];
  budget_tier?: number;
  best_dishes?: string[];
  notes?: string;
  status?: PlaceStatus;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<CreatePlaceBody>(request);

    if (!body) return badRequest("Expected a JSON body");
    if (!body.name?.trim()) return badRequest("A name is required");
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return badRequest("Latitude and longitude are required");
    }

    const tier = body.budget_tier ?? 2;
    if (tier < 1 || tier > 4) {
      return badRequest("Budget tier must be between 1 and 4");
    }

    const place = await repo.createPlace({
      name: body.name.trim(),
      address: body.address?.trim() || null,
      lat: body.lat,
      lng: body.lng,
      cuisine: body.cuisine ?? [],
      budget_tier: tier as BudgetTier,
      osm_id: null,
      source: "manual",
      status: body.status ?? "active",
      best_dishes: body.best_dishes ?? [],
      notes: body.notes?.trim() || null,
      created_by: user.id,
    } as Omit<Place, "id" | "created_at" | "updated_at">);

    return json({ place }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
