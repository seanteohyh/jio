"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote } from "@/components/ui";
import { formatCents } from "@/lib/expenses";
import { buildSplitSummaryText } from "@/lib/splitSummary";
import type { BillSplit } from "@/types";

const CARD_W = 1000;
const CARD_H = 640;
const MAX_ROWS = 8;

const COLOR = {
  outer: "#f7e9de",
  card: "#fbf6ef",
  ember: "#c0392b",
  ink: "#2b2b2b",
  stone: "#6b665c",
  line: "#ece5d8",
};

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SERIF_FONT = "Georgia, 'Times New Roman', serif";

/** Wraps `text` to fit `maxWidth`, returning at most `maxLines` lines (the
 *  last one ellipsized if there was more). Canvas has no native wrapping —
 *  copied from `ShareResultCard`'s own helper, this codebase's established
 *  pattern of each share card staying self-contained rather than sharing a
 *  canvas-drawing module. */
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

/** A thin space between every character — canvas has no reliable
 *  `letter-spacing`, so small tracked-out labels space themselves out
 *  this way instead. */
function tracked(text: string): string {
  return text.split("").join(" ");
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

function draw(canvas: HTMLCanvasElement, split: BillSplit) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  ctx.fillStyle = COLOR.outer;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 56;
  ctx.fillStyle = COLOR.card;
  roundRect(ctx, pad / 2, pad / 2, CARD_W - pad, CARD_H - pad, 24);
  ctx.fill();

  ctx.textBaseline = "alphabetic";
  let y = pad + 34;

  ctx.fillStyle = COLOR.stone;
  ctx.font = `600 18px ${MONO_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(tracked("WHO OWES WHAT"), CARD_W / 2, y);

  y += 46;
  ctx.fillStyle = COLOR.ink;
  ctx.font = `700 42px ${SERIF_FONT}`;
  const titleLines = wrapText(ctx, split.title, CARD_W - pad * 2, 2);
  for (const line of titleLines) {
    ctx.fillText(line, CARD_W / 2, y);
    y += 48;
  }

  const payer = split.participants.find((p) => p.user_id === split.payer_user_id);
  const others = split.participants.filter((p) => p.user_id !== split.payer_user_id);

  y += 10;
  ctx.fillStyle = COLOR.stone;
  ctx.font = `500 20px ${MONO_FONT}`;
  ctx.fillText(`${payer?.display_name ?? "Someone"} paid`, CARD_W / 2, y);

  const dividerY = y + 28;
  ctx.save();
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(pad, dividerY);
  ctx.lineTo(CARD_W - pad, dividerY);
  ctx.stroke();
  ctx.restore();

  let rowY = dividerY + 46;
  ctx.textAlign = "left";
  const shown = others.slice(0, MAX_ROWS);
  for (const p of shown) {
    ctx.font = `500 26px ${MONO_FONT}`;
    ctx.fillStyle = COLOR.ink;
    const nameLines = wrapText(ctx, p.display_name ?? "Someone", CARD_W - pad * 2 - 180, 1);
    ctx.fillText(nameLines[0] ?? "", pad, rowY);

    ctx.font = `700 26px ${MONO_FONT}`;
    ctx.fillStyle = p.paid_at ? COLOR.stone : COLOR.ember;
    ctx.textAlign = "right";
    ctx.fillText(
      p.paid_at ? `${formatCents(p.owed_cents)} ✓` : formatCents(p.owed_cents),
      CARD_W - pad,
      rowY
    );
    ctx.textAlign = "left";
    rowY += 42;
  }
  if (others.length > MAX_ROWS) {
    ctx.fillStyle = COLOR.stone;
    ctx.font = `500 20px ${MONO_FONT}`;
    ctx.fillText(`+${others.length - MAX_ROWS} more`, pad, rowY);
    rowY += 42;
  }
  if (others.length === 0) {
    ctx.fillStyle = COLOR.stone;
    ctx.font = `500 22px ${MONO_FONT}`;
    ctx.fillText("Nobody else owes anything yet.", pad, rowY);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.ember;
  ctx.font = `700 22px ${MONO_FONT}`;
  const payerLabel = (payer?.display_name ?? "the payer").toUpperCase();
  const footer = payer?.phone_number
    ? `PAY ${payerLabel} · ${payer.phone_number}`
    : `PAY ${payerLabel}`;
  ctx.fillText(tracked(footer), CARD_W / 2, CARD_H - pad - 10);
  ctx.textAlign = "left";
}

/**
 * The shareable "who owes what" image + text for a split — posted once
 * into a group chat instead of the host collecting each person's own
 * phone number and nudging them one by one. Mirrors `ShareResultCard`'s
 * own Copy image/Share/Download actions, plus a "Copy summary" button
 * for the plain-text version (`buildSplitSummaryText`) to paste
 * anywhere an image doesn't fit.
 */
export default function SplitShareCard({ split }: { split: BillSplit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [textCopyState, setTextCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [canCopyImage, setCanCopyImage] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, split);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split.title, split.payer_user_id, split.participants]);

  useEffect(() => {
    setCanCopyImage(
      typeof window !== "undefined" && "ClipboardItem" in window && !!navigator.clipboard?.write
    );
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [new File([], "split.png", { type: "image/png" })] })
    );
  }, []);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (textCopyState !== "copied") return;
    const timer = setTimeout(() => setTextCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [textCopyState]);

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
    const file = new File([blob], "split-summary.png", { type: "image/png" });
    try {
      await navigator.share({ title: split.title, text: `Who owes what for "${split.title}"`, files: [file] });
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
    a.download = "split-summary.png";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySummaryText = async () => {
    try {
      await navigator.clipboard.writeText(buildSplitSummaryText(split));
      setTextCopyState("copied");
    } catch {
      setTextCopyState("error");
    }
  };

  return (
    <div className="border-line bg-cream space-y-2 rounded-xl border p-3">
      <p className="text-ink text-sm font-medium">Share who owes what</p>

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
        <Button size="sm" variant="ghost" onClick={copySummaryText}>
          {textCopyState === "copied" ? "Copied" : "Copy summary"}
        </Button>
      </div>

      {copyState === "error" && <ErrorNote>Could not copy the image — try Download instead.</ErrorNote>}
      {textCopyState === "error" && <ErrorNote>Could not copy the summary text.</ErrorNote>}
    </div>
  );
}
