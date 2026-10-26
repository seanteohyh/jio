import { describe, expect, it } from "vitest";
import { buildWhatsAppPaymentLink } from "@/lib/whatsapp";

describe("buildWhatsAppPaymentLink", () => {
  it("builds a wa.me link with the digits-only phone number", () => {
    const link = buildWhatsAppPaymentLink("+65 9123-4567", 1250, "Friday lunch");
    expect(link.startsWith("https://wa.me/+6591234567?text=")).toBe(true);
  });

  it("includes the formatted amount and Jio title in the message", () => {
    const link = buildWhatsAppPaymentLink("91234567", 1250, "Friday lunch");
    const message = decodeURIComponent(link.split("?text=")[1]);
    expect(message).toContain("$12.50");
    expect(message).toContain("Friday lunch");
  });
});
