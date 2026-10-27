import { formatCents } from "./expenses";
import type { BillSplit } from "@/types";

/**
 * Plain-text "who owes what" for a split — built once so the share
 * card's clipboard text and its canvas image never drift apart on
 * wording. Lists everyone but the payer (nothing to collect from
 * themselves), each with their own amount and a "(paid)" marker once
 * marked settled, and closes with how to actually pay the payer —
 * their own number if they've set one, otherwise just their name.
 * Meant to be posted once into a group chat, rather than nudging each
 * person individually with their own phone number on file.
 */
export function buildSplitSummaryText(split: BillSplit): string {
  const payer = split.participants.find((p) => p.user_id === split.payer_user_id);
  const others = split.participants.filter((p) => p.user_id !== split.payer_user_id);
  const payerName = payer?.display_name ?? "the payer";

  const lines = [
    `💸 ${split.title}`,
    ...others.map(
      (p) =>
        `${p.display_name ?? "Someone"}: ${formatCents(p.owed_cents)}${p.paid_at ? " (paid)" : ""}`
    ),
    "",
    payer?.phone_number ? `Pay ${payerName} — ${payer.phone_number}` : `Pay ${payerName}`,
  ];
  return lines.join("\n");
}
