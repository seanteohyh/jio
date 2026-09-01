"use client";

import { useEffect } from "react";
import { LinkButton } from "@/components/ui";

/**
 * Defense-in-depth backstop for this route — CHANGES_20260814.md §1. The
 * page itself already catches a failed `getPublicPlace()` call and shows
 * "This place isn't available" rather than throwing, but this boundary
 * covers anything else that could still throw during render (e.g.
 * `getCurrentUser()`), so a signed-out visitor who followed a shared link
 * never lands on Next's bare, unbranded "A server error occurred" page.
 */
export default function PublicPlaceError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Public place page crashed", error);
  }, [error]);

  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-xl font-semibold">This place isn&apos;t available</h1>
      <p className="text-stone text-sm">
        This hit a snag loading — try again in a moment.
      </p>
      <LinkButton href="/">Back to the start</LinkButton>
    </div>
  );
}
