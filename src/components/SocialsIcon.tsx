import { Facebook, Instagram, Link2 } from "lucide-react";
import { socialsHost } from "@/lib/utils";

/**
 * CHANGES_20260821b.md §1 — domain-sniffed icon for a place's `socials_url`,
 * shared between the place page's button and the small icon shown next to
 * the Google Maps pin in the Jio ballot/standing lists (same icon either
 * way, per the doc).
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
  return <Link2 className={className} strokeWidth={2} />;
}
