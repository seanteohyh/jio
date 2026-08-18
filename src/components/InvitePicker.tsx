"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Users, X } from "lucide-react";
import { Field, inputClass } from "./ui";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { Kaki, TeamUser } from "@/types";

export interface InviteSelection {
  userIds: string[];
  kakiIds: string[];
}

/**
 * One search field over people *and* Kaki groups, multi-select, freely mixed.
 *
 * Replaces the previous two stacked controls (a group dropdown, then a wall of
 * name buttons underneath). They looked like two flavours of the same action
 * but behaved differently, and neither scaled past a couple of dozen people.
 *
 * Groups expand to individual invitees at submit time — see the note in
 * `/api/events`. This component only reports *what* was picked; snapshotting is
 * the server's job, because the client has no business deciding who counts as a
 * member.
 *
 * The people list is ranked, not alphabetical, and isn't fetched-then-
 * filtered client-side any more — docs/user-discovery.md §4.2. `query` is
 * sent to `/api/users?q=` so the server can apply its own tiering (people
 * you've shared a Jio with, then Kaki co-members, both shown with no query
 * at all; everyone else in the office only once actually searched for).
 * Kaki groups stay a client-side filter — there's no ranking concept for
 * groups, just the existing short list.
 */
export default function InvitePicker({
  value,
  onChange,
  selfId,
}: {
  value: InviteSelection;
  onChange: (next: InviteSelection) => void;
  /** Excluded from results — you are always in your own Jio. */
  selfId?: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim();

  // `value.userIds` is passed as includeIds so a selection made under an
  // earlier search (or arrived via a personal invite link, CHANGES_20260818.md
  // §3) keeps resolving its display name after the search text changes or
  // clears — otherwise a tier-3 pick would silently lose its name the
  // moment it's no longer the thing being searched for.
  const params = new URLSearchParams();
  if (needle) params.set("q", needle);
  for (const id of value.userIds) params.append("include_id", id);
  const { data: userData } = useSWR<{ users: TeamUser[] }>(
    `/api/users?${params.toString()}`,
    fetcher
  );
  const { data: kakiData } = useSWR<{ kakis: Kaki[] }>(
    features.kakis ? "/api/kakis" : null,
    fetcher
  );

  const matchedUsers = useMemo(
    () => (userData?.users ?? []).filter((u) => u.user_id !== selfId),
    [userData, selfId]
  );
  const allKakis = kakiData?.kakis ?? [];

  const matchedKakis = needle
    ? allKakis.filter((k) => k.name.toLowerCase().includes(needle.toLowerCase()))
    : allKakis;

  const toggleUser = (id: string) =>
    onChange({
      ...value,
      userIds: value.userIds.includes(id)
        ? value.userIds.filter((x) => x !== id)
        : [...value.userIds, id],
    });

  const toggleKaki = (id: string) =>
    onChange({
      ...value,
      kakiIds: value.kakiIds.includes(id)
        ? value.kakiIds.filter((x) => x !== id)
        : [...value.kakiIds, id],
    });

  const selectedUsers = matchedUsers.filter((u) =>
    value.userIds.includes(u.user_id)
  );
  const selectedKakis = allKakis.filter((k) => value.kakiIds.includes(k.id));
  const nothingSelected =
    selectedUsers.length === 0 && selectedKakis.length === 0;

  // Groups first: picking one is the higher-leverage action, and it is the
  // thing people scroll past when it sits underneath a list of names.
  const results = [
    ...matchedKakis.map((k) => ({ kind: "kaki" as const, kaki: k })),
    ...matchedUsers.map((u) => ({ kind: "user" as const, user: u })),
  ];

  return (
    <div className="space-y-3">
      <Field
        label="Invite"
        hint="People and groups. Pick as many as you like."
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
          placeholder="Search a name or a group…"
          autoComplete="off"
        />
      </Field>

      {!nothingSelected && (
        <div className="flex flex-wrap gap-1.5">
          {selectedKakis.map((kaki) => (
            <button
              key={`sel-k-${kaki.id}`}
              type="button"
              onClick={() => toggleKaki(kaki.id)}
              className="bg-ember flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-white"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {kaki.name}
              {typeof kaki.member_count === "number" && (
                <span className="opacity-75"> · {kaki.member_count}</span>
              )}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
          {selectedUsers.map((user) => (
            <button
              key={`sel-u-${user.user_id}`}
              type="button"
              onClick={() => toggleUser(user.user_id)}
              className="bg-ember flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-white"
            >
              {user.display_name}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {results.length === 0 && (
          <p className="text-stone text-xs">
            {needle ? `Nobody matching “${query}”.` : "Nobody to invite yet."}
          </p>
        )}

        {results.map((row) => {
          if (row.kind === "kaki") {
            const active = value.kakiIds.includes(row.kaki.id);
            return (
              <button
                key={`k-${row.kaki.id}`}
                type="button"
                onClick={() => toggleKaki(row.kaki.id)}
                className={
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm " +
                  (active
                    ? "bg-ember-tint text-ember"
                    : "hover:bg-cream")
                }
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">{row.kaki.name}</span>
                </span>
                <span className="text-stone text-xs">
                  group
                  {typeof row.kaki.member_count === "number" &&
                    ` · ${row.kaki.member_count} member${row.kaki.member_count === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          }

          const active = value.userIds.includes(row.user.user_id);
          return (
            <button
              key={`u-${row.user.user_id}`}
              type="button"
              onClick={() => toggleUser(row.user.user_id)}
              className={
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm " +
                (active
                  ? "bg-ember-tint text-ember"
                  : "hover:bg-cream")
              }
            >
              <span>{row.user.display_name}</span>
              {active && <Check className="h-4 w-4" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {selectedKakis.length > 0 && (
        <p className="text-stone text-xs">
          Everyone in {selectedKakis.length === 1 ? "that group" : "those groups"}{" "}
          is invited individually, so later membership changes will not alter
          this Jio. Anyone picked twice is only invited once.
        </p>
      )}
    </div>
  );
}
