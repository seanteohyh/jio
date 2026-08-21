"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "./ui";

/** One row of the top-3 vote breakdown — CHANGES_20260819c.md §3. */
export interface ShareResultStanding {
  name: string;
  points: number;
  /** True for the row matching the Jio's actual winner, if it's among the
   *  top 3 shown — a roulette spin or a host's `editEventWinner` correction
   *  can leave the winner outside the top-voted places, in which case no
   *  row is highlighted, which is fine: this chart is showing how the vote
   *  broke down, not re-litigating what happened. */
  isWinner: boolean;
}

interface ShareResultCardProps {
  /** The Jio's title, e.g. "Friday team lunch". */
  title: string;
  /** The winning place's name, or the free-text label if it has no `places` row. */
  placeName: string;
  /** Formatted date/time string, already localized — this component does no date math. */
  whenLabel: string;
  /**
   * Top 3 (or fewer) options by Borda points, winner-first-if-present. Empty
   * or omitted skips the chart entirely — e.g. a Jio closed with no votes at
   * all has nothing to break down.
   */
  standings?: ShareResultStanding[];
}

const CARD_W = 1200;
const CARD_H = 760;

const COLOR = {
  paper: "#fbf6ef",
  cream: "#f7e9de",
  ember: "#c0392b",
  emberTint: "#f7e4e0",
  espresso: "#3d342c",
  ink: "#2b2b2b",
  stone: "#6b665c",
  sage: "#567b57",
  sageTint: "#e4eee5",
  line: "#ece5d8",
  /** Neutral bar fill for a non-winning row — one hue means "this one won,"
   *  not one color per row, so every other row shares this same tone. */
  muted: "#c9bfae",
};

/** Wraps `text` to fit `maxWidth`, returning at most `maxLines` lines (the
 *  last one ellipsized if there was more). Canvas has no native wrapping. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    while (
      ctx.measureText(`${last}…`).width > maxWidth &&
      last.length > 1
    ) {
      lines[maxLines - 1] = last.slice(0, -1);
    }
    if (
      words.join(" ") !==
      lines.join(" ")
    ) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, "")}…`;
    }
  }

  return lines;
}

function draw(
  canvas: HTMLCanvasElement,
  { title, placeName, whenLabel, standings = [] }: ShareResultCardProps
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 72;

  // Card
  ctx.fillStyle = COLOR.cream;
  roundRect(ctx, pad / 2, pad / 2, CARD_W - pad, CARD_H - pad, 28);
  ctx.fill();

  // "DECIDED" pill, echoing the in-app resolved-vote card.
  ctx.fillStyle = COLOR.sageTint;
  const pillY = pad + 8;
  roundRect(ctx, pad, pillY, 168, 44, 22);
  ctx.fill();
  ctx.fillStyle = COLOR.sage;
  ctx.font = "700 20px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("✓ DECIDED", pad + 20, pillY + 23);

  // Place name — the headline.
  ctx.fillStyle = COLOR.ink;
  ctx.font = "800 74px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  const nameLines = wrapText(ctx, placeName, CARD_W - pad * 2, 2);
  let y = 292;
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 80;
  }

  // Jio title + time.
  ctx.fillStyle = COLOR.stone;
  ctx.font = "500 32px system-ui, -apple-system, sans-serif";
  const subLine = `${title} · ${whenLabel}`;
  const subLines = wrapText(ctx, subLine, CARD_W - pad * 2, 1);
  const subBaseline = y + 20;
  ctx.fillText(subLines[0] ?? subLine, pad, subBaseline);

  // Top-3 vote breakdown — a compact horizontal bar chart, winner's row in
  // full ember (its points folded into the same pill this card used to show
  // standalone), the rest in one shared muted tone. Skipped entirely when
  // there's nothing to show (a Jio closed with no votes at all).
  if (standings.length > 0) {
    const ROW_H = 40;
    const ROW_GAP = 12;
    const barWidth = CARD_W - pad * 2;
    const maxPoints = Math.max(1, ...standings.map((s) => s.points));
    let rowY = subBaseline + 40;

    for (const row of standings.slice(0, 3)) {
      const pointsLabel = `${row.points} pt${row.points === 1 ? "" : "s"}`;

      ctx.textBaseline = "alphabetic";
      ctx.font = row.isWinner
        ? "700 26px system-ui, -apple-system, sans-serif"
        : "500 24px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = row.isWinner ? COLOR.ink : COLOR.stone;
      const labelLines = wrapText(ctx, row.name, barWidth - 150, 1);
      ctx.fillText(labelLines[0] ?? row.name, pad, rowY + 18);

      if (row.isWinner) {
        ctx.font = "700 20px system-ui, -apple-system, sans-serif";
        const textWidth = ctx.measureText(pointsLabel).width;
        const pillW = textWidth + 28;
        const pillH = 32;
        const pillX = CARD_W - pad - pillW;
        const pillY2 = rowY - 8;
        ctx.fillStyle = COLOR.emberTint;
        roundRect(ctx, pillX, pillY2, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.fillStyle = COLOR.ember;
        ctx.textBaseline = "middle";
        ctx.fillText(pointsLabel, pillX + 14, pillY2 + pillH / 2);
      } else {
        ctx.font = "500 20px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = COLOR.stone;
        ctx.textAlign = "right";
        ctx.fillText(pointsLabel, CARD_W - pad, rowY + 16);
        ctx.textAlign = "left";
      }

      const barY = rowY + 26;
      const barH = 10;
      ctx.fillStyle = COLOR.line;
      roundRect(ctx, pad, barY, barWidth, barH, barH / 2);
      ctx.fill();
      const fillWidth = Math.max(barH, (row.points / maxPoints) * barWidth);
      ctx.fillStyle = row.isWinner ? COLOR.ember : COLOR.muted;
      roundRect(ctx, pad, barY, fillWidth, barH, barH / 2);
      ctx.fill();

      rowY += ROW_H + ROW_GAP;
    }
  }

  // "jio" wordmark, bottom-right — brand attribution on a card that will
  // travel outside the app entirely.
  ctx.fillStyle = COLOR.ember;
  ctx.font = "800 34px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillText("jio", CARD_W - pad, CARD_H - pad - 8);
  ctx.textAlign = "left";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders the decided-Jio result as a shareable PNG — CHANGES_20260803.md
 * §12c. A link only tells you where to look; this is the thing you'd
 * actually paste into a chat.
 *
 * Client-side canvas render rather than a server screenshot service: no
 * extra infra, and it works from the same data already on the page.
 * Copy/Share both need a real user gesture on the button that triggers
 * them, so `toBlob` runs fresh in each handler rather than being cached
 * from the draw effect.
 */
export default function ShareResultCard(props: ShareResultCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [canCopyImage, setCanCopyImage] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.title, props.placeName, props.whenLabel, props.standings]);

  useEffect(() => {
    setCanCopyImage(
      typeof window !== "undefined" &&
        "ClipboardItem" in window &&
        !!navigator.clipboard?.write
    );
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({
          files: [new File([], "jio.png", { type: "image/png" })],
        })
    );
  }, []);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const toBlob = (): Promise<Blob | null> =>
    new Promise((resolve) =>
      canvasRef.current
        ? canvasRef.current.toBlob(resolve, "image/png")
        : resolve(null)
    );

  const copyImage = async () => {
    const blob = await toBlob();
    if (!blob) return setCopyState("error");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const shareImage = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "jio-result.png", { type: "image/png" });
    try {
      await navigator.share({
        title: props.title,
        text: `${props.placeName} — ${props.title}`,
        files: [file],
      });
    } catch {
      // Includes the user dismissing the sheet. Not an error.
    }
  };

  const downloadImage = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jio-result.png";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-line bg-cream space-y-2 rounded-xl border p-3">
      <p className="text-ink text-sm font-medium">Share the result</p>

      <canvas
        ref={canvasRef}
        className="border-line w-full rounded-lg border"
        style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
      />

      <div className="flex flex-wrap gap-2">
        {canCopyImage && (
          <Button size="sm" onClick={copyImage}>
            {copyState === "copied" ? "Copied" : "Copy image"}
          </Button>
        )}
        {canShareFiles && (
          <Button size="sm" variant="secondary" onClick={shareImage}>
            Share…
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={downloadImage}>
          Download
        </Button>
      </div>

      {copyState === "error" && (
        <ErrorNote>Could not copy the image — try Download instead.</ErrorNote>
      )}
    </div>
  );
}
