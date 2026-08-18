"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders `value` as a QR code — CHANGES_20260818.md §3 / docs/user-
 * discovery.md §4.3: "the real context here is an office — the person is
 * across the room, not across the internet." Generated client-side (no
 * third-party image service, consistent with the rest of this app running
 * with no external runtime dependencies beyond what's explicitly
 * configured) via the `qrcode` package.
 */
export default function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // No QR, no crash — the plain link/copy button next to this still
        // works either way.
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="bg-cream animate-pulse rounded-lg"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={dataUrl}
      alt="QR code for this link"
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
