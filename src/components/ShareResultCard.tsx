"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "./ui";

interface ShareResultCardProps {
  /** The Jio's title, e.g. "Friday team lunch". */
  title: string;
  /** The winning place's name, or the free-text label if it has no `places` row. */
  placeName: string;
  /** Formatted date/time string, already localized — this component does no date math. */
  whenLabel: string;
  /** The winner's final Borda tally, if known. Omitted rather than shown as 0. */
  points?: number;
}

const CARD_W = 1200;
const CARD_H = 630;

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
  { title, placeName, whenLabel, points }: ShareResultCardProps
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
  ctx.font = "800 76px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  const nameLines = wrapText(ctx, placeName, CARD_W - pad * 2, 2);
  let y = 300;
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 84;
  }

  // Jio title + time.
  ctx.fillStyle = COLOR.stone;
  ctx.font = "500 32px system-ui, -apple-system, sans-serif";
  const subLine = `${title} · ${whenLabel}`;
  const subLines = wrapText(ctx, subLine, CARD_W - pad * 2, 1);
  ctx.fillText(subLines[0] ?? subLine, pad, y + 20);

  // Points tally, bottom-left, only when known.
  if (typeof points === "number") {
    ctx.fillStyle = COLOR.emberTint;
    roundRect(ctx, pad, CARD_H - pad - 56, 220, 56, 16);
    ctx.fill();
    ctx.fillStyle = COLOR.ember;
    ctx.font = "700 26px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${points} point${points === 1 ? "" : "s"}`,
      pad + 20,
      CARD_H - pad - 28
    );
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
  }, [props.title, props.placeName, props.whenLabel, props.points]);

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
