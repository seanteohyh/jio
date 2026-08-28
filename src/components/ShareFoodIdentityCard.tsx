"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "./ui";

export interface ShareFoodIdentityAward {
  label: string;
  value: string;
  sub?: string;
}

interface ShareFoodIdentityCardProps {
  /** Small pill above the headline, e.g. "YOUR FOOD IDENTITY" or "<Kaki name>'s VIBE". */
  eyebrow: string;
  headline: string;
  description: string;
  /** "MMMM YYYY", already localized. */
  monthLabel: string;
  /** Kaki-level award slots (Most active / Adventurer). Omitted for the
   *  personal card, which has no equivalent. */
  awards?: ShareFoodIdentityAward[];
}

const CARD_W = 1200;
const CARD_H = 760;

/** Same palette as ShareResultCard — one shared "brand," not per-card colors. */
const COLOR = {
  paper: "#fbf6ef",
  cream: "#f7e9de",
  ember: "#c0392b",
  emberTint: "#f7e4e0",
  ink: "#2b2b2b",
  stone: "#6b665c",
  line: "#ece5d8",
};

/** Same wrapping approach as ShareResultCard — canvas has no native wrapping. */
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
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      lines[maxLines - 1] = last.slice(0, -1);
    }
    if (words.join(" ") !== lines.join(" ")) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, "")}…`;
    }
  }

  return lines;
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

function draw(
  canvas: HTMLCanvasElement,
  { eyebrow, headline, description, monthLabel, awards = [] }: ShareFoodIdentityCardProps
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 72;

  ctx.fillStyle = COLOR.cream;
  roundRect(ctx, pad / 2, pad / 2, CARD_W - pad, CARD_H - pad, 28);
  ctx.fill();

  // Eyebrow pill.
  ctx.font = "700 20px system-ui, -apple-system, sans-serif";
  const pillW = ctx.measureText(eyebrow).width + 40;
  ctx.fillStyle = COLOR.emberTint;
  const pillY = pad + 8;
  roundRect(ctx, pad, pillY, pillW, 44, 22);
  ctx.fill();
  ctx.fillStyle = COLOR.ember;
  ctx.textBaseline = "middle";
  ctx.fillText(eyebrow, pad + 20, pillY + 23);

  // Headline.
  ctx.fillStyle = COLOR.ink;
  ctx.font = "800 74px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  const headlineLines = wrapText(ctx, headline, CARD_W - pad * 2, 2);
  let y = 292;
  for (const line of headlineLines) {
    ctx.fillText(line, pad, y);
    y += 80;
  }

  // Description.
  ctx.fillStyle = COLOR.stone;
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  const descLines = wrapText(ctx, description, CARD_W - pad * 2, 2);
  let descY = y + 16;
  for (const line of descLines) {
    ctx.fillText(line, pad, descY);
    descY += 42;
  }

  // Award slots (Kaki-level only) — a light divider then two rows.
  if (awards.length > 0) {
    const dividerY = descY + 24;
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, dividerY);
    ctx.lineTo(CARD_W - pad, dividerY);
    ctx.stroke();

    let rowY = dividerY + 56;
    for (const award of awards.slice(0, 2)) {
      ctx.fillStyle = COLOR.stone;
      ctx.font = "700 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(award.label.toUpperCase(), pad, rowY);

      ctx.fillStyle = COLOR.ink;
      ctx.font = "700 32px system-ui, -apple-system, sans-serif";
      ctx.fillText(award.value, pad, rowY + 42);

      if (award.sub) {
        ctx.fillStyle = COLOR.stone;
        ctx.font = "500 22px system-ui, -apple-system, sans-serif";
        ctx.fillText(award.sub, pad + 340, rowY + 42);
      }

      rowY += 76;
    }
  }

  // Month caption, bottom-left.
  ctx.fillStyle = COLOR.stone;
  ctx.font = "500 24px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(monthLabel, pad, CARD_H - pad - 4);

  // "jio" wordmark, bottom-right.
  ctx.fillStyle = COLOR.ember;
  ctx.font = "800 34px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("jio", CARD_W - pad, CARD_H - pad - 8);
  ctx.textAlign = "left";
}

/**
 * Renders a food identity card (personal or Kaki-level) as a shareable PNG —
 * CHANGES_20260821_combined2.md Item 1. Same canvas pattern as
 * `ShareResultCard` (client-side render, no server screenshot service,
 * `toBlob` run fresh per gesture for Copy/Share) — a separate component
 * rather than a shared one, since the content shapes genuinely differ
 * (Kaki-level carries two award rows the personal card has no equivalent
 * for), but the drawing helpers and button row are deliberately identical.
 */
export default function ShareFoodIdentityCard(props: ShareFoodIdentityCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [canCopyImage, setCanCopyImage] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.eyebrow, props.headline, props.description, props.monthLabel, props.awards]);

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
      canvasRef.current ? canvasRef.current.toBlob(resolve, "image/png") : resolve(null)
    );

  const copyImage = async () => {
    const blob = await toBlob();
    if (!blob) return setCopyState("error");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const shareImage = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "jio-food-identity.png", { type: "image/png" });
    try {
      await navigator.share({
        title: props.headline,
        text: `${props.eyebrow}: ${props.headline}`,
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
    a.download = "jio-food-identity.png";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-line bg-cream space-y-2 rounded-xl border p-3">
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
