import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { fetchBlogCandidates, validateBlogUrl } from "@/lib/blogImport";

/**
 * Pull candidate place names out of a food blog post.
 *
 * Returns names only — no coordinates, no auto-insert. The user picks which
 * ones are real and fills in the details, because a heading is a guess, not a
 * restaurant record.
 */
export async function POST(request: NextRequest) {
  const blocked = featureGate("blogImport");
  if (blocked) return blocked as NextResponse;

  try {
    await requireUser();
    const body = await readJson<{ url?: string }>(request);

    const url = body?.url?.trim();
    if (!url) return badRequest("Paste a blog post URL");

    // Validate before fetching. This is the SSRF gate.
    const validation = validateBlogUrl(url);
    if (!validation.ok) {
      return badRequest(validation.reason ?? "That URL is not allowed");
    }

    const { candidates, title } = await fetchBlogCandidates(url);

    return json({
      candidates,
      title,
      count: candidates.length,
      source: validation.url?.hostname ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
