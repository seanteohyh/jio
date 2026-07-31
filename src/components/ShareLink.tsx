"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";

interface ShareLinkProps {
  /** Absolute URL to share. */
  url: string;
  /** Shown in the native share sheet and as the section label. */
  label?: string;
  /** Text accompanying the link in the native share sheet. */
  shareText?: string;
}

/**
 * A shareable link with a copy button, and the native share sheet where the
 * browser has one.
 *
 * The origin is resolved on the client. On a server render `absoluteUrl()`
 * may have no origin to use, so the first paint can show a bare path — this
 * re-renders once mounted so what the user actually sees is absolute. Without
 * that, a `useState(window.location.origin)` initialiser would throw during
 * SSR and a plain server-computed string would hydrate mismatched.
 */
export default function ShareLink({
  url,
  label = "Share this Jio",
  shareText,
}: ShareLinkProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Resolve again after mount so window.location.origin is available.
  const resolved =
    mounted && !/^https?:\/\//i.test(url)
      ? `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`
      : url;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resolved);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The URL is selectable text, so
      // there is still a manual path — just say nothing rather than throw.
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: label, text: shareText, url: resolved });
    } catch {
      // Includes the user simply dismissing the sheet. Not an error.
    }
  };

  return (
    <div className="border-line bg-cream space-y-2 rounded-xl border p-3">
      <p className="text-ink text-sm font-medium">{label}</p>

      <p
        className="text-stone overflow-x-auto font-mono text-xs whitespace-nowrap select-all"
        data-testid="share-url"
      >
        {resolved}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canNativeShare && (
          <Button size="sm" variant="secondary" onClick={share}>
            Share…
          </Button>
        )}
      </div>
    </div>
  );
}
