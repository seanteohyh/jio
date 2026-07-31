"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  SectionHeading,
  inputClass,
} from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";

interface ImportResponse {
  candidates: string[];
  title: string | null;
  count: number;
  source: string | null;
}

/**
 * Import place names from a food blog post.
 *
 * Names only — the page pulls headings out of one URL the user pasted and
 * hands them back as suggestions. Nothing is created automatically, because a
 * heading is a guess: "10 Best Hawker Stalls" produces ten strings, and some
 * of them will be section titles, not restaurants.
 */
export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setDismissed([]);

    try {
      const payload = await mutateJson<ImportResponse>(
        "/api/import/blog",
        "POST",
        { url: url.trim() }
      );
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that page");
    } finally {
      setBusy(false);
    }
  };

  const visible =
    result?.candidates.filter((c) => !dismissed.includes(c)) ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import from a blog
        </h1>
        <p className="text-stone mt-1 text-sm">
          Paste a food blog post and Jio will pull the place names out of its
          headings for you to add.
        </p>
      </header>

      <Card>
        <form onSubmit={run} className="space-y-3">
          <Field
            label="Blog post URL"
            hint="One page at a time. Jio fetches only the URL you paste."
          >
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
              placeholder="https://someblog.com/best-lunch-bugis"
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? "Reading…" : "Read the page"}
          </Button>
        </form>
      </Card>

      {result && (
        <section>
          <SectionHeading>
            {result.count} candidate{result.count === 1 ? "" : "s"}
          </SectionHeading>

          {result.title && (
            <p className="text-stone mb-3 text-xs">
              From “{result.title}”{result.source && ` · ${result.source}`}
            </p>
          )}

          {visible.length === 0 ? (
            <EmptyState
              title="Nothing usable found"
              description="Some blogs put place names in images or unusual markup. You can still add them by hand."
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((candidate) => (
                <li
                  key={candidate}
                  className="border-line bg-cream/60 flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <span className="truncate text-sm">{candidate}</span>
                  <span className="flex shrink-0 gap-2">
                    <Link
                      href={`/places/new?name=${encodeURIComponent(candidate)}`}
                      className="text-ember text-xs underline"
                    >
                      Add
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDismissed((d) => [...d, candidate])}
                      className="text-stone text-xs underline"
                    >
                      Not a place
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-stone text-xs">
        Jio only fetches pages you paste in, one at a time. It does not crawl,
        and it does not scrape review sites — their terms of service forbid it.
      </p>
    </div>
  );
}
