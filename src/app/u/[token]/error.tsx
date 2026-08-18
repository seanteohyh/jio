"use client";

import { useEffect } from "react";
import { LinkButton } from "@/components/ui";

/**
 * Defense-in-depth backstop for this route — same reasoning as
 * `/p/[id]/error.tsx` and `/l/[token]/error.tsx`. The page itself already
 * catches a failed `resolvePersonalInvite()` call and shows "This link
 * isn't available" rather than throwing, but this boundary covers anything
 * else that could still throw during render.
 */
export default function PersonalInviteError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Personal invite page crashed", error);
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
