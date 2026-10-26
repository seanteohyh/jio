import { formatCents } from "./expenses";

/**
 * Builds a `wa.me` deep link with a pre-filled message — the chosen
 * send mechanism for a bill-split payment nudge (099_bill_splits.sql).
 * Zero cost, zero infrastructure: this app already assumes WhatsApp is
 * the team's actual channel (see the Jio-result share card's own reasoning
 * about WhatsApp link previews). `phoneNumber` is used exactly as typed
 * except for stripping spaces/dashes/parens — `wa.me` expects digits only,
 * with a country code; this app doesn't validate or normalize beyond that,
 * since a wrong number just opens the wrong (or no) WhatsApp chat rather
 * than silently failing anything.
 */
export function buildWhatsAppPaymentLink(
  phoneNumber: string,
  amountCents: number,
  jioTitle: string
): string {
  const digits = phoneNumber.replace(/[\s\-()]/g, "");
  const message = `Hey! You owe ${formatCents(amountCents)} for "${jioTitle}" — thanks!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
