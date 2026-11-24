import { ImageResponse } from "next/og";
import { getRepoAsync } from "@/lib/data/repo";
import { formatDateTime } from "@/lib/utils";
import { config } from "@/lib/config";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = {
  outer: "#f7e9de",
  card: "#fbf6ef",
  ember: "#c0392b",
  ink: "#2b2b2b",
  stone: "#6b665c",
  line: "#ece5d8",
  sage: "#517351",
};

/**
 * Fetches a Google Font as a raw TTF buffer for Satori (the renderer
 * behind `ImageResponse`) to embed — the documented Next.js technique:
 * Google's CSS2 endpoint serves a legacy `format('truetype')`/`opentype`
 * source to a plain server-side fetch with no browser `Accept` header,
 * which a bare `format('woff2')` response (what a real browser gets)
 * can't be reliably parsed from on every Satori version. Returns `null`
 * on any failure so the image still renders — with Satori's own default
 * sans — rather than a network hiccup breaking the whole card.
 */
async function loadGoogleFont(family: string, weight: number, text: string) {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`
      )
    ).text();
    const match = css.match(/src: url\(([^)]+)\) format\('(opentype|truetype)'\)/);
    if (!match) {
      console.log(`[opengraph-image] no ttf/otf source found for ${family}`);
      return null;
    }
    const res = await fetch(match[1]);
    if (!res.ok) {
      console.log(`[opengraph-image] font file fetch returned ${res.status}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (error) {
    console.log(
      "[opengraph-image] font load failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repo = await getRepoAsync();

  let preview;
  try {
    preview = await repo.getPublicEventPreview(token);
  } catch {
    preview = null;
  }

  const title = preview?.title ?? `${config.appName} — where are we eating?`;
  // Google's CSS2 `text=` param subsets the font to only the characters
  // listed — every distinct string this component can ever render needs
  // to contribute its characters here, including the Jio's own
  // user-entered title/host name/place names (which can contain anything),
  // or a character missing from the subset renders as a tofu box with no
  // fallback (caught during review: a ✓ glyph wasn't in the first pass).
  const dynamicText = [
    preview?.title,
    preview?.hostName,
    preview?.winnerPlaceName,
    ...(preview?.placeOptions.map((o) => o.name) ?? []),
  ]
    .filter(Boolean)
    .join("");
  const staticText =
    "WHERE ARE WE EATING?DECIDEDNobody's confirmed yetgoing so far+ more" +
    "TAP TO VOTE — NO SIGNUP NEEDED TO PEEKTAP TO SEE WHO'S GOING" +
    "This invite may have expired — open it to check.0123456789";
  const fontText = `${title}${dynamicText}${staticText}`;
  const headlineFont = await loadGoogleFont("Bricolage Grotesque", 700, fontText);

  const decided = preview?.status === "closed" && !!preview?.winnerPlaceName;
  const options = preview?.placeOptions.slice(0, 3) ?? [];
  const extraOptions = (preview?.placeOptions.length ?? 0) - options.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLOR.outer,
          fontFamily: headlineFont ? "Bricolage" : "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 1080,
            height: 510,
            background: COLOR.card,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 28,
            padding: "56px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                background: COLOR.ember,
              }}
            />
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 4,
                color: COLOR.stone,
              }}
            >
              WHERE ARE WE EATING?
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 64,
              fontWeight: 700,
              color: COLOR.ink,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>

          {preview && (
            <div style={{ display: "flex", marginTop: 14, fontSize: 28, color: COLOR.stone }}>
              Hosted by {preview.hostName}
              {preview.datePhase !== "polling" && ` · ${formatDateTime(preview.scheduledAt)}`}
            </div>
          )}

          <div
            style={{
              display: "flex",
              marginTop: 36,
              marginBottom: 36,
              borderTop: `2px dashed ${COLOR.line}`,
              width: "100%",
            }}
          />

          {decided ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: COLOR.sage,
                  }}
                />
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: COLOR.sage }}>
                  DECIDED
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: COLOR.ink }}>
                {preview?.winnerPlaceName}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", fontSize: 28, color: COLOR.ink }}>
                {preview
                  ? preview.goingCount > 0
                    ? `${preview.goingCount} going so far`
                    : "Nobody's confirmed yet"
                  : "This invite may have expired — open it to check."}
              </div>
              {options.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {options.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        display: "flex",
                        padding: "8px 18px",
                        borderRadius: 999,
                        border: `1px solid ${COLOR.line}`,
                        background: COLOR.outer,
                        fontSize: 24,
                        color: COLOR.ink,
                      }}
                    >
                      {o.name}
                    </div>
                  ))}
                  {extraOptions > 0 && (
                    <div style={{ display: "flex", fontSize: 24, color: COLOR.stone, padding: "8px 4px" }}>
                      +{extraOptions} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flex: 1 }} />

          {preview && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 3,
                color: COLOR.ember,
              }}
            >
              {decided ? "TAP TO SEE WHO'S GOING" : "TAP TO VOTE — NO SIGNUP NEEDED TO PEEK"}
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: headlineFont
        ? [{ name: "Bricolage", data: headlineFont, weight: 700, style: "normal" }]
        : undefined,
    }
  );
}
