"use client";

import { useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";

/** `PushManager.subscribe()` wants the VAPID public key as a raw Uint8Array,
 *  not the base64url string it's usually handed around as. Built over an
 *  explicit `new ArrayBuffer` rather than `Uint8Array.from` — the latter
 *  infers the looser `ArrayBufferLike`, which newer TS's DOM lib no longer
 *  accepts where `BufferSource` (what `applicationServerKey` wants) is
 *  expected. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const array = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

/**
 * The one explicit control that turns push on — §6, built on §2's
 * install prompt. Deliberately a button the user has to press, not
 * something that fires on page load: iOS requires the permission request
 * come from a real click, and asking unprompted trains people to reflexively
 * decline before they know what it's for.
 */
export default function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined";
    setSupported(ok);
    if (!ok) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {
        // Not registered yet, or blocked — reads as "not subscribed."
      });
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          "Notifications are blocked. Enable them in your browser's site settings to turn this on."
        );
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError(
          "Push isn't finished setting up on this deploy yet — ask whoever runs it to add the VAPID keys."
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const raw = sub.toJSON();
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error("The browser did not return a usable subscription");
      }

      await mutateJson("/api/push/subscribe", "POST", {
        endpoint: raw.endpoint,
        p256dh: raw.keys.p256dh,
        authKey: raw.keys.auth,
      });
      await mutateJson("/api/push/preference", "POST", { enabled: true });
      setSubscribed(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not turn on notifications"
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await mutateJson(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          "DELETE"
        );
        await sub.unsubscribe();
      }
      await mutateJson("/api/push/preference", "POST", { enabled: false });
      setSubscribed(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not turn off notifications"
      );
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">Notifications</p>
          <p className="text-stone text-xs">
            {subscribed
              ? "On — you'll be notified when you're invited to a Jio or one you're in gets decided."
              : "Get notified when you're invited to a Jio, or when one you're in gets decided."}
          </p>
        </div>
        <Button
          size="sm"
          variant={subscribed ? "secondary" : "primary"}
          onClick={subscribed ? disable : enable}
          disabled={busy}
        >
          {busy ? "…" : subscribed ? "Turn off" : "Turn on"}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
