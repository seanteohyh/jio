"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, ErrorNote } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { fetcher, mutateJson } from "@/lib/fetcher";

interface MeUser {
  notify_admin_reports?: boolean;
}

/**
 * Admin-only — the push every admin gets when someone files "Report a
 * problem" or a Home "Give feedback" suggestion (both land in the same
 * general_reports queue) can get noisy on a busy day; this is the mute for
 * specifically that push. Deliberately separate from `PushNotificationToggle`
 * (the master on/off for every push type) and stacks on top of it the same
 * way `ReminderSettingsPanel`'s own toggle does for reminders — turning
 * this off leaves Jio-invite/decided-Jio pushes untouched, and reports/
 * suggestions still land in Moderation exactly as before, just silently.
 */
export default function AdminReportNotificationsToggle() {
  const { data, mutate } = useSWR<{ user: MeUser | null }>("/api/me", fetcher);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (!data) return;
    setEnabled(data.user?.notify_admin_reports ?? true);
  }, [data]);

  const save = async (nextEnabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/push/admin-reports-preference", "POST", {
        enabled: nextEnabled,
      });
      await mutate();
      showToast("Saved");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save that setting"
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    save(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">
            Report &amp; suggestion pushes
          </p>
          <p className="text-stone text-xs">
            {enabled
              ? "You're notified when someone reports a problem or leaves a suggestion."
              : "Off — they still land in Moderation, just no push."}
          </p>
        </div>
        <Button
          size="sm"
          variant={enabled ? "secondary" : "primary"}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? "…" : enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
