"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, ErrorNote, inputClass } from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { UserPrefs } from "@/types";

/** Common lead times — a plain number input would work too, but a short
 *  picker of the values anyone would actually pick keeps this one control
 *  instead of a label plus a text field. */
const LEAD_TIME_OPTIONS = [10, 15, 30, 60, 120, 240];

function leadTimeLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`;
}

/**
 * CHANGES_20260821c.md §1 — the "You"-page default for the per-Jio
 * "starting soon" reminder: on/off, plus the lead time used whenever a
 * Jio has no override of its own (`EventReminderPanel`, on the Jio page
 * itself). Deliberately separate from `PushNotificationToggle`, right
 * below it — that one is the master on/off for every push type; this is
 * specifically whether *this* reminder fires at all, on top of whatever
 * the master toggle already allows.
 *
 * Reuses `/api/user-prefs`, the same endpoint the Taste preferences card
 * saves to — the route merges a partial body against whatever's already
 * saved, so this panel changing just these two fields never touches
 * anyone's cuisine/budget prefs saved from that other card.
 */
export default function ReminderSettingsPanel() {
  const { data, mutate } = useSWR<{ prefs: UserPrefs | null }>(
    "/api/user-prefs",
    fetcher
  );
  const [enabled, setEnabled] = useState(true);
  const [leadMinutes, setLeadMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.prefs?.reminders_enabled ?? true);
    setLeadMinutes(data.prefs?.reminder_lead_minutes ?? 30);
  }, [data]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const save = async (nextEnabled: boolean, nextLeadMinutes: number) => {
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/user-prefs", "PUT", {
        reminders_enabled: nextEnabled,
        reminder_lead_minutes: nextLeadMinutes,
      });
      await mutate();
      setSaved(true);
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
    save(next, leadMinutes);
  };

  const changeLead = (minutes: number) => {
    setLeadMinutes(minutes);
    save(enabled, minutes);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">Jio reminders</p>
          <p className="text-stone text-xs">
            {enabled
              ? "A heads-up before a Jio you're confirmed for starts."
              : "Off — no starting-soon reminder for any Jio."}
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

      {enabled && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-stone">Default lead time</span>
          <select
            value={leadMinutes}
            onChange={(e) => changeLead(Number(e.target.value))}
            disabled={busy}
            className={inputClass}
          >
            {LEAD_TIME_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {leadTimeLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      )}

      {saved && <p className="text-sage text-xs">Saved.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export { LEAD_TIME_OPTIONS, leadTimeLabel };
