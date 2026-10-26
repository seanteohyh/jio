/**
 * Receipt line-item extraction via Claude's vision API — 099_bill_splits.sql.
 * This app's first metered, per-call external API dependency; everything
 * else here either runs locally or sits on a free tier. A direct `fetch`
 * to the Messages API rather than installing `@anthropic-ai/sdk` — no AI
 * SDK is pulled into this codebase yet, and one HTTP call doesn't earn one.
 *
 * Same "no-op, not a throw, when unconfigured" shape as `src/lib/push.ts`'s
 * VAPID check — a deploy with no `ANTHROPIC_API_KEY` set should behave
 * exactly as if OCR doesn't exist, falling back to the manual-entry path,
 * not break the upload. Every extracted item is shown as editable before
 * anything is saved regardless of how clean the extraction came back —
 * OCR on a real, sometimes-crumpled thermal receipt won't always be
 * perfect, so this never needs to be "trusted," only "good enough to
 * start from."
 */

export interface ExtractedReceiptItem {
  label: string;
  amount_cents: number;
}

export interface ExtractedReceipt {
  items: ExtractedReceiptItem[];
  subtotal_cents: number;
  gst_cents: number;
  service_charge_cents: number;
}

export interface ExtractReceiptResult {
  ok: boolean;
  receipt?: ExtractedReceipt;
  /** Human-readable, safe to show directly — never a raw API error body. */
  error?: string;
}

const EXTRACT_TOOL = {
  name: "extract_receipt",
  description:
    "Record every line item on this receipt, plus its subtotal, GST and service charge if shown.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description:
          "Every purchased item, one entry per line — not GST or service charge, which have their own fields below.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "The item's name as printed." },
            amount_cents: {
              type: "integer",
              description: "That line's total price in cents (e.g. $12.50 -> 1250).",
            },
          },
          required: ["label", "amount_cents"],
        },
      },
      subtotal_cents: {
        type: "integer",
        description: "The subtotal before GST/service charge, in cents. 0 if not shown.",
      },
      gst_cents: {
        type: "integer",
        description: "GST/tax amount in cents, if the receipt shows one. 0 if not shown.",
      },
      service_charge_cents: {
        type: "integer",
        description: "Service charge amount in cents, if the receipt shows one. 0 if not shown.",
      },
    },
    required: ["items", "subtotal_cents", "gst_cents", "service_charge_cents"],
  },
};

/** Defensive cap — a real receipt has dozens of lines at most; this just
 *  bounds how much an unexpectedly huge or malformed response can write. */
const MAX_ITEMS = 60;

function sanitize(raw: unknown): ExtractedReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawItems = Array.isArray(r.items) ? r.items : [];

  const items: ExtractedReceiptItem[] = [];
  for (const entry of rawItems.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const label = typeof e.label === "string" ? e.label.trim() : "";
    const amount =
      typeof e.amount_cents === "number" && Number.isFinite(e.amount_cents)
        ? Math.max(0, Math.round(e.amount_cents))
        : null;
    if (!label || amount === null) continue;
    items.push({ label: label.slice(0, 200), amount_cents: amount });
  }

  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;

  return {
    items,
    subtotal_cents: num(r.subtotal_cents),
    gst_cents: num(r.gst_cents),
    service_charge_cents: num(r.service_charge_cents),
  };
}

export async function extractReceipt(
  imageBase64: string,
  mediaType: string
): Promise<ExtractReceiptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[receiptOcr] ANTHROPIC_API_KEY not configured — skipping extraction");
    return { ok: false, error: "Receipt scanning isn't set up on this deployment" };
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_receipt" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: "Extract every line item and the subtotal/GST/service charge from this receipt.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.log(`[receiptOcr] API returned ${response.status}`);
      return { ok: false, error: "Couldn't read that receipt — try entering items by hand" };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
    };
    const toolUse = (data.content ?? []).find(
      (block) => block.type === "tool_use" && block.name === "extract_receipt"
    );
    const receipt = sanitize(toolUse?.input);
    if (!receipt) {
      return { ok: false, error: "Couldn't make sense of that receipt — try entering items by hand" };
    }

    return { ok: true, receipt };
  } catch (error) {
    console.log("[receiptOcr] extraction failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't read that receipt — try entering items by hand" };
  }
}
