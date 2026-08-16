"use client";

import { useEffect } from "react";
import { LinkButton } from "@/components/ui";

/**
 * Defense-in-depth backstop for this route — same reasoning as
 * `/p/[id]/error.tsx` (CHANGES_20260814.md §1). The page itself already
 * catches a failed `getPublicLobang()` call and shows "This link isn't
 * available" rather than throwing, but this boundary covers anything else
 * that could still throw during render, so a signed-out visitor who
 * followed a shared link never lands on Next's bare, unbranded "A server
 * error occurred" page.
 */
export default function PublicLobangError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Public lobang page crashed", error);
  }, [error]);

  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
      <p className="text-stone text-sm">
        Something went wrong loading this page. Try again in a moment.
      </p>
      <LinkButton href="/">Back to the start</LinkButton>
    </div>
  );
}
