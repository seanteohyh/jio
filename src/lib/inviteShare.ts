import type { PublicEventPreview } from "@/types";

/**
 * The pre-filled text a host (or an invitee re-sharing) sends alongside
 * the invite link — shared by every surface that offers one
 * (`/events/[id]`'s own "Share this Jio", the signed-out preview's own
 * re-share), so the pitch to a first-time recipient never drifts between
 * them. Leads with the ask, not the app name — "vote on where we're
 * eating" is what actually gets a stranger to tap, and "no signup needed
 * to peek" answers the one objection a cold link raises before they ever
 * open it.
 */
export function inviteShareText(title: string): string {
  return `🍽️ ${title} — vote on where we're eating! Takes 10 seconds, no signup needed to peek.`;
}

/**
 * One-line summary of a Jio's current state for someone who's never seen
 * it — the Open Graph description a chat app's own link-preview card
 * shows (alongside `opengraph-image.tsx`'s rendered card), and
 * `generateMetadata`'s fallback for a crawler that skips images
 * entirely. Mirrors what the signed-out preview page itself already
 * shows, condensed to one line.
 */
export function inviteDescription(preview: PublicEventPreview): string {
  if (preview.status === "closed" && preview.winnerPlaceName) {
    return `Decided: ${preview.winnerPlaceName} — hosted by ${preview.hostName}.`;
  }
  const going =
    preview.goingCount > 0 ? `${preview.goingCount} going so far` : "Nobody's confirmed yet";
  const options = preview.placeOptions
    .slice(0, 3)
    .map((o) => o.name)
    .join(", ");
  return [`Hosted by ${preview.hostName}`, going, options ? `Vote: ${options}` : null]
    .filter(Boolean)
    .join(" · ");
}
