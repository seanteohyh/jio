"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes the app installable.
 *
 * Skipped in development: a cached shell during hot reloading produces
 * confusing, hard-to-reproduce staleness.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unregistered service worker only costs offline support.
      });
    };

    // Wait for load so registration never competes with first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
