import { NextResponse } from "next/server";
import { requireUser } from "./auth";
import { getRepoAsync } from "./data/repo";
import { featureGate } from "./config";
import type { FeatureKey } from "./config";
import type { Repo } from "./data";
import type { AuthUser } from "@/types";

/**
 * Route plumbing.
 *
 * Without this, every route handler repeats the same fifteen lines of auth
 * check, try/catch and error mapping — and they drift apart, which is how one
 * endpoint ends up leaking a stack trace that its neighbour doesn't.
 */

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Please sign in"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Not allowed"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Something went wrong"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Map a thrown error onto a sensible status code. */
export function errorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "UNAUTHENTICATED") return unauthorized();
  if (
    /only the host|can add places|can remove|not allowed|cannot|only an admin|or an admin can/i.test(
      message
    )
  ) {
    return forbidden(message);
  }
  if (/not found|not valid|does not exist/i.test(message)) {
    return notFound(message);
  }
  if (
    /already|invalid|required|must be|not currently blocked|not waiting for review/i.test(
      message
    )
  ) {
    return badRequest(message);
  }

  // Log the real error server-side; return something safe to the client.
  console.error("[jio] unhandled route error:", error);
  return serverError(message);
}

export interface RouteContext {
  user: AuthUser;
  repo: Repo;
}

/**
 * Wrap a handler that needs a signed-in user and a repo.
 *
 * `feature` optionally gates the whole route behind a feature flag, so a
 * disabled feature 404s at the API as well as disappearing from the nav.
 */
export function withAuth<T>(
  handler: (ctx: RouteContext) => Promise<T>,
  feature?: FeatureKey
): () => Promise<NextResponse> {
  return async () => {
    if (feature) {
      const gate = featureGate(feature);
      if (gate) return gate as NextResponse;
    }
    try {
      const user = await requireUser();
      const repo = await getRepoAsync();
      const result = await handler({ user, repo });
      return json(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parse a JSON body, returning `null` rather than throwing on bad input. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Numeric query param with a fallback. */
export function numberParam(
  params: URLSearchParams,
  key: string,
  fallback: number
): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Comma-separated list query param. */
export function listParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
