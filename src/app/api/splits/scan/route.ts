import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { extractReceipt } from "@/lib/receiptOcr";

// Decoded-size cap on the uploaded image — a defensive bound on both the
// vision API payload and storage usage, not a hard technical limit.
// Client-side downscaling (SplitEditor) keeps a normal phone photo well
// under this; this just stops an unusually large file from being sent at
// all rather than failing confusingly partway through.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Stateless: uploads the photo and runs OCR on it, but writes nothing to
 * `bill_splits` yet — 099_bill_splits.sql's review-and-assign step
 * happens entirely in the client's own state, seeded from whatever this
 * returns, so the server only ever sees the finished item list once the
 * host actually saves (`POST /api/splits`). No split exists yet at scan
 * time (it may never — the host could cancel), so the upload is scoped
 * to the uploader, not any split or Jio. The upload still happens here
 * (not discarded) so a saved split can show the real photo back; an
 * abandoned scan just leaves one unreferenced object in storage, the
 * same "harmless if unused" trade-off this app already accepts
 * elsewhere rather than building cleanup for it.
 */
export async function POST(request: NextRequest) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const body = await readJson<{ imageBase64?: string; mediaType?: string }>(request);
    if (!body?.imageBase64 || !body.mediaType) {
      return badRequest("Missing the receipt photo");
    }
    if (body.imageBase64.length > (MAX_IMAGE_BYTES * 4) / 3) {
      return badRequest("That photo is too large — try a smaller one");
    }

    const [receiptImagePath, extracted] = await Promise.all([
      repo.uploadReceiptImage(user.id, body.imageBase64, body.mediaType),
      extractReceipt(body.imageBase64, body.mediaType),
    ]);

    return json({
      receiptImagePath,
      ok: extracted.ok,
      receipt: extracted.receipt ?? null,
      error: extracted.error ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
