"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui";

/**
 * UX review log #7 — scoped to individual-page crashes, using the app's
 * normal wrapper (layout.tsx, BottomNav included) since only this segment's
 * content is swapped out. The shared-frame case (`global-error.tsx`, which
 * can't reuse that wrapper) is a separate, smaller follow-up, not bundled
 * in here. `/l/[token]`, `/p/[id]`, `/u/[token]` keep their own more
 * specific boundaries, which take precedence over this one for their routes.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page crashed", error);
  }, [error]);

  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-stone text-sm">
        This page hit a snag. Try again, or head back to the start.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <LinkButton href="/" variant="secondary">
          Back to the start
        </LinkButton>
      </div>
    </div>
  );
}
