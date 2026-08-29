import { Facebook, Instagram } from "lucide-react";
import { LinkIcon } from "@/components/icons";
import { socialsHost } from "@/lib/utils";

/**
 * CHANGES_20260821b.md §1 — domain-sniffed icon for a place's `socials_url`,
 * shared between the place page's button and the small icon shown next to
 * the Google Maps pin in the Jio ballot/standing lists (same icon either
 * way, per the doc).
 *
 * Instagram/Facebook stay their real recognizable brand marks — UX review
 * log #20's one deliberate exception to the bespoke icon set, since a user
 * needs to recognize "this is Instagram," not "this matches Jio's house
 * style." The generic fallback (`LinkIcon`) isn't a brand mark, so it's
 * drawn in-house like everything else.
 */
export default function SocialsIcon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const host = socialsHost(url);
  if (host === "instagram") {
    return <Instagram className={className} strokeWidth={2} />;
  }
  if (host === "facebook") {
    return <Facebook className={className} strokeWidth={2} />;
  }
  return <LinkIcon className={className} strokeWidth={2} />;
}
