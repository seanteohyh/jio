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
   * all has nothing to break down. The winner's own row (if present) isn't
   * drawn as a fourth list item — its points fold into the summary line
   * instead, per the hawker-chit redesign — only the runners-up print below
   * the divider.
   */
  standings?: ShareResultStanding[];
  /** Distinct voters, for the "N votes" summary line. */
  voteCount?: number;
  /** Pre-formatted time the Jio actually closed, e.g. "12:04 pm". */
  closedAtLabel?: string;
  /** Pre-formatted lunch time, e.g. "12:30 pm", for the "see you at" footer. */
  seeYouAtLabel?: string;
  /**
   * Google Maps link for the winning place, if it's a real one (a free-text
   * winner has nothing to link to). NOT folded into `Share…`'s text: a
   * shared link in the caption reliably makes at least one common share
   * target (WhatsApp) drop the attached image entirely and show only a link
   * preview — worse than the image alone, since the whole point of this
   * card is the image. Offered instead as its own small "Copy Maps link"
   * action, so someone who wants both still can, as two messages rather
   * than a single share that might silently lose the image.
   */
  mapsUrl?: string;
  /**
   * UX review log #25 — the Jio's own invite link (`eventInviteUrl`), as a
   * separate "Copy Jio link" button, same reasoning as `mapsUrl`: kept out
   * of the share text so the image itself isn't dropped by a chat client's
   * link-preview handling. Deliberately a plain button, not a QR code — two
   * decisions locked in the review, no host-facing toggle for either.
   */
  inviteUrl?: string;
}

const CARD_W = 1200;
const CARD_H = 760;
const NOTCH_R = 26;

/**
 * Redesigned per Sean's own hawker-order-chit reference (2026-08-29): a
 * lighter card floating on a deeper warm ground, rather than the earlier
 * cream-on-paper pairing — `outer`/`card` are the same two brand tokens as
 * before, just swapped, so the card now reads as the lighter surface.
 */
const COLOR = {
  outer: "#f7e9de",
  card: "#fbf6ef",
  ember: "#c0392b",
  espresso: "#3d342c",
  ink: "#2b2b2b",
  stone: "#6b665c",
  line: "#ece5d8",
};

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SERIF_FONT = "Georgia, 'Times New Roman', serif";

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

/** Inserts a thin space between every character — canvas has no
 *  `letter-spacing` property that's safe to rely on across engines yet, so
 *  small tracked-out labels ("DECIDED", the footer line) space themselves
 *  out this way instead. */
function tracked(text: string): string {
  return text.split("").join(" ");
}

/**
 * Cuts the two ticket-stub notches out of the card. Paints solid
 * outer-coloured discs on top of the card, rather than erasing with
 * `destination-out` compositing: that operation doesn't reveal a layer
 * drawn earlier, it erases down to true transparency (alpha 0) — which
 * looked right in the live canvas (its own parent card shows through
 * transparent pixels) but left the *exported* PNG with a real alpha hole.
 * Sharing or converting that file (Messages, WhatsApp, a screenshot tool)
 * commonly flattens transparent pixels to solid black. A solid, opaque
 * fill is correct everywhere the image ends up.
 */
function cutNotches(ctx: CanvasRenderingContext2D, pad: number, dividerY: number) {
  ctx.save();
  ctx.fillStyle = COLOR.outer;
  ctx.beginPath();
  ctx.arc(pad / 2, dividerY, NOTCH_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CARD_W - pad / 2, dividerY, NOTCH_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
 * The real brand mark (`public/logo.svg`), cached once at module scope so
 * repeated draws (every prop change re-renders the canvas) don't re-fetch
 * it. Loading is asynchronous; `draw()` below draws everything else
 * immediately and, if the mark isn't ready yet, re-runs once it is rather
 * than approximating it with canvas-drawn shapes — a shareable ticket
 * should carry the actual logo, not a stand-in.
 */
let logoImage: HTMLImageElement | null = null;
let logoLoaded = false;
function getLogoImage(onReady: () => void): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  if (!logoImage) {
    logoImage = new Image();
    logoImage.src = "/logo.svg";
    logoImage.onload = () => {
      logoLoaded = true;
      onReady();
    };
  } else if (logoLoaded) {
    return logoImage;
  }
  return logoLoaded ? logoImage : null;
}

function draw(
  canvas: HTMLCanvasElement,
  {
    title,
    placeName,
    whenLabel,
    standings = [],
    voteCount = 0,
    closedAtLabel,
    seeYouAtLabel,
  }: ShareResultCardProps,
  onLogoReady: () => void
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  ctx.fillStyle = COLOR.outer;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 72;

  // The ticket body — a lighter card floating on the deeper outer ground,
  // matching the hawker-chit reference rather than the earlier reversed
  // pairing.
  ctx.fillStyle = COLOR.card;
  roundRect(ctx, pad / 2, pad / 2, CARD_W - pad, CARD_H - pad, 28);
  ctx.fill();

  // The real brand mark, watermarked in the header's top-right corner —
  // drawn low-opacity so it reads as a mark on the paper, not a logo
  // competing with the headline.
  const logo = getLogoImage(onLogoReady);
  if (logo) {
    const logoSize = 64;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.drawImage(
      logo,
      CARD_W - pad - logoSize,
      pad - 8,
      logoSize,
      logoSize
    );
    ctx.restore();
  }

  let y = pad + 40;

  // "DECIDED" — small, tracked-out, centred.
  ctx.fillStyle = COLOR.stone;
  ctx.font = `600 20px ${MONO_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(tracked("DECIDED"), CARD_W / 2, y);

  // The winner headline — a serif, not the app's usual display sans, per
  // the reference: this is the one place the chit deliberately breaks from
  // the rest of the brand's type system, reading as a printed notice
  // rather than an app screen.
  y += 56;
  ctx.fillStyle = COLOR.ink;
  ctx.font = `700 62px ${SERIF_FONT}`;
  const headline = `✓ ${placeName} wins`;
  const headlineLines = wrapText(ctx, headline, CARD_W - pad * 2, 2);
  for (const line of headlineLines) {
    ctx.fillText(line, CARD_W / 2, y);
    y += 68;
  }

  // Line 1: which Jio, and when — context a recipient outside the app
  // still needs, even though the reference itself omits it.
  y += 10;
  ctx.fillStyle = COLOR.stone;
  ctx.font = `500 26px ${MONO_FONT}`;
  const contextLine = wrapText(ctx, `${title} · ${whenLabel}`, CARD_W - pad * 2, 1);
  ctx.fillText(contextLine[0] ?? "", CARD_W / 2, y);

  // Line 2: the summary the reference actually shows — winner's points (if
  // it's among the standings shown), vote count, close time.
  y += 40;
  const winnerRow = standings.find((s) => s.isWinner);
  const summaryParts = [
    winnerRow
      ? `${winnerRow.points} pt${winnerRow.points === 1 ? "" : "s"}`
      : null,
    voteCount > 0 ? `${voteCount} vote${voteCount === 1 ? "" : "s"}` : null,
    closedAtLabel ? `closed ${closedAtLabel}` : null,
  ].filter((p): p is string => Boolean(p));
  if (summaryParts.length > 0) {
    ctx.fillText(summaryParts.join(" · "), CARD_W / 2, y);
    y += 40;
  } else {
    y += 4;
  }

  // The dashed divider, with the ticket-stub notches cut at the same level.
  const dividerY = y + 26;
  cutNotches(ctx, pad, dividerY);
  ctx.save();
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(pad, dividerY);
  ctx.lineTo(CARD_W - pad, dividerY);
  ctx.stroke();
  ctx.restore();

  // The runners-up — plain rows, name left / points right, no bars and no
  // repeat of the winner's own row (already named above). Skipped
  // entirely when there's nothing left to show.
  const runnersUp = standings.filter((s) => !s.isWinner).slice(0, 2);
  let rowY = dividerY + 60;
  ctx.textAlign = "left";
  for (const row of runnersUp) {
    ctx.font = `500 30px ${MONO_FONT}`;
    ctx.fillStyle = COLOR.ink;
    const nameLines = wrapText(ctx, row.name, CARD_W - pad * 2 - 120, 1);
    ctx.fillText(nameLines[0] ?? row.name, pad, rowY);

    ctx.font = `700 30px ${MONO_FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(
      `${row.points} pt${row.points === 1 ? "" : "s"}`,
      CARD_W - pad,
      rowY
    );
    ctx.textAlign = "left";

    rowY += 56;
  }

  // The footer — a plain, quiet sign-off rather than a barcode/wordmark
  // stub, matching the reference's minimal close.
  if (seeYouAtLabel) {
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.stone;
    ctx.font = `500 24px ${MONO_FONT}`;
    ctx.fillText(
      tracked(`THANK YOU · SEE YOU AT ${seeYouAtLabel}`),
      CARD_W / 2,
      CARD_H - pad - 12
    );
  }
  ctx.textAlign = "left";
}

/**
 * Renders the decided-Jio result as a shareable ticket — CHANGES_20260803.md
 * §12c, redesigned as a hawker-style order chit per UX review log #25 and
 * Sean's own reference (2026-08-29). A link only tells you where to look;
 * this is the thing you'd actually paste into a chat.
 *
 * Client-side canvas render rather than a server screenshot service: no
 * extra infra, and it works from the same data already on the page. The
 * perforated notches and dashed divider need real canvas draw calls to
 * render correctly in the exported PNG — a CSS approximation only looks
 * right in the live DOM, not in the flattened image someone shares.
 * Copy/Share both need a real user gesture on the button that triggers
 * them, so `toBlob` runs fresh in each handler rather than being cached
 * from the draw effect.
 */
export default function ShareResultCard(props: ShareResultCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [mapsLinkCopyState, setMapsLinkCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [inviteLinkCopyState, setInviteLinkCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [canCopyImage, setCanCopyImage] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      const redraw = () => {
        if (canvasRef.current) draw(canvasRef.current, props, redraw);
      };
      redraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.title,
    props.placeName,
    props.whenLabel,
    props.standings,
    props.voteCount,
    props.closedAtLabel,
    props.seeYouAtLabel,
  ]);

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

  useEffect(() => {
    if (mapsLinkCopyState !== "copied") return;
    const timer = setTimeout(() => setMapsLinkCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [mapsLinkCopyState]);

  useEffect(() => {
    if (inviteLinkCopyState !== "copied") return;
    const timer = setTimeout(() => setInviteLinkCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [inviteLinkCopyState]);

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
        text: `Jio confirmed! ${props.placeName} — ${props.title}`,
        files: [file],
      });
    } catch {
      // Includes the user dismissing the sheet. Not an error.
    }
  };

  /** See `mapsUrl`'s doc comment — deliberately its own action, not folded
   *  into `shareImage`'s text. */
  const copyMapsLink = async () => {
    if (!props.mapsUrl) return;
    try {
      await navigator.clipboard.writeText(props.mapsUrl);
      setMapsLinkCopyState("copied");
    } catch {
      setMapsLinkCopyState("error");
    }
  };

  /** See `inviteUrl`'s doc comment — same reasoning as `copyMapsLink`. */
  const copyInviteLink = async () => {
    if (!props.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(props.inviteUrl);
      setInviteLinkCopyState("copied");
    } catch {
      setInviteLinkCopyState("error");
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
        {props.mapsUrl && (
          <Button size="sm" variant="ghost" onClick={copyMapsLink}>
            {mapsLinkCopyState === "copied" ? "Copied" : "Copy Maps link"}
          </Button>
        )}
        {props.inviteUrl && (
          <Button size="sm" variant="ghost" onClick={copyInviteLink}>
            {inviteLinkCopyState === "copied" ? "Copied" : "Copy Jio link"}
          </Button>
        )}
      </div>

      {copyState === "error" && (
        <ErrorNote>Could not copy the image — try Download instead.</ErrorNote>
      )}
      {mapsLinkCopyState === "error" && (
        <ErrorNote>Could not copy the link.</ErrorNote>
      )}
      {inviteLinkCopyState === "error" && (
        <ErrorNote>Could not copy the link.</ErrorNote>
      )}
    </div>
  );
}
