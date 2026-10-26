import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractReceipt } from "@/lib/receiptOcr";

/**
 * This app's first metered external API call — see receiptOcr.ts's own
 * doc comment. Since there's no real `ANTHROPIC_API_KEY` to exercise the
 * actual call in CI, this mocks `fetch` and asserts the forced tool-use
 * request shape, plus that a malformed/unconfigured/failed response
 * degrades to an empty, fully-editable item list rather than throwing —
 * a bad scan must never fail the upload itself.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function mockToolUseResponse(input: unknown) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: "tool_use", name: "extract_receipt", input }],
    }),
  };
}

describe("extractReceipt", () => {
  it("returns ok:false without throwing when ANTHROPIC_API_KEY isn't set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractReceipt("base64data", "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.receipt).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a forced tool-use call with the image and a fixed tool_choice", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolUseResponse({ items: [], subtotal_cents: 0, gst_cents: 0, service_charge_cents: 0 })
    );

    await extractReceipt("abc123", "image/png");

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toEqual({ type: "tool", name: "extract_receipt" });
    expect(body.tools[0].name).toBe("extract_receipt");
    const imageBlock = body.messages[0].content.find((c: { type: string }) => c.type === "image");
    expect(imageBlock.source).toEqual({ type: "base64", media_type: "image/png", data: "abc123" });
  });

  it("parses a well-formed extraction", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolUseResponse({
        items: [
          { label: "Chicken rice", amount_cents: 1000 },
          { label: "Kopi", amount_cents: 400 },
        ],
        subtotal_cents: 1400,
        gst_cents: 126,
        service_charge_cents: 140,
      })
    );

    const result = await extractReceipt("abc123", "image/jpeg");
    expect(result.ok).toBe(true);
    expect(result.receipt?.items).toEqual([
      { label: "Chicken rice", amount_cents: 1000 },
      { label: "Kopi", amount_cents: 400 },
    ]);
    expect(result.receipt?.subtotal_cents).toBe(1400);
    expect(result.receipt?.gst_cents).toBe(126);
    expect(result.receipt?.service_charge_cents).toBe(140);
  });

  it("drops malformed items instead of failing the whole extraction", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolUseResponse({
        items: [
          { label: "Valid item", amount_cents: 500 },
          { label: "", amount_cents: 500 }, // no label — dropped
          { label: "No amount" }, // missing amount_cents — dropped
          { label: "Negative", amount_cents: -100 }, // clamped to 0, kept
        ],
        subtotal_cents: 500,
        gst_cents: 0,
        service_charge_cents: 0,
      })
    );

    const result = await extractReceipt("abc123", "image/jpeg");
    expect(result.ok).toBe(true);
    expect(result.receipt?.items).toEqual([
      { label: "Valid item", amount_cents: 500 },
      { label: "Negative", amount_cents: 0 },
    ]);
  });

  it("degrades gracefully when the response has no tool_use block", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "I couldn't read this receipt." }] }),
    });

    const result = await extractReceipt("abc123", "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("degrades gracefully on a non-ok API response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const result = await extractReceipt("abc123", "image/jpeg");
    expect(result.ok).toBe(false);
  });

  it("degrades gracefully when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const result = await extractReceipt("abc123", "image/jpeg");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("uses ANTHROPIC_MODEL when set, else the cheap default", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolUseResponse({ items: [], subtotal_cents: 0, gst_cents: 0, service_charge_cents: 0 })
    );

    process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
    await extractReceipt("abc123", "image/jpeg");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe("claude-opus-5-5");
  });
});
