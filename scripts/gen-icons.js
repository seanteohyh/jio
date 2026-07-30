/**
 * Regenerate the PWA icons.
 *
 *   node scripts/gen-icons.js
 *
 * Draws the bowl mark as an SVG and rasterises it with sharp, if sharp is
 * installed. The committed PNGs in public/ were produced this way, so you only
 * need this when changing the mark or the brand colour.
 *
 * sharp is not a dependency — installing a native image library to redraw an
 * icon you change once a year is not a good trade. Install it on demand:
 *   npm i -D sharp && node scripts/gen-icons.js
 */

const fs = require("node:fs");
const path = require("node:path");

const BG = "#b4532f";
const CREAM = "#faf7f2";
const OUT = path.resolve(__dirname, "..", "public");

function svg(size, maskable) {
  const s = size;
  const scale = maskable ? 0.76 : 1;
  const pad = ((1 - scale) * s) / 2;
  const radius = maskable ? 0 : s * 0.22;

  // Coordinates below are expressed against the scaled art box.
  const c = (v) => pad + v * scale;
  const cx = c(s / 2);
  const bw = s * 0.6 * scale;
  const bh = s * 0.32 * scale;
  const top = c(s * 0.54);
  const stroke = s * 0.04 * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${radius}" fill="${BG}"/>
  <g stroke="${CREAM}" stroke-width="${stroke}" stroke-linecap="round">
    <line x1="${cx + s * 0.215 * scale}" y1="${c(s * 0.14)}" x2="${cx - s * 0.065 * scale}" y2="${top - s * 0.02 * scale}"/>
    <line x1="${cx + s * 0.265 * scale}" y1="${c(s * 0.14)}" x2="${cx - s * 0.015 * scale}" y2="${top - s * 0.02 * scale}"/>
  </g>
  <path d="M ${cx - bw / 2} ${top} A ${bw / 2} ${bh} 0 0 0 ${cx + bw / 2} ${top} Z" fill="${CREAM}"/>
  <rect x="${cx - bw / 2 - s * 0.025 * scale}" y="${top - s * 0.04 * scale}" width="${bw + s * 0.05 * scale}" height="${s * 0.068 * scale}" rx="${s * 0.034 * scale}" fill="${CREAM}"/>
  <rect x="${cx - s * 0.11 * scale}" y="${top + bh - s * 0.015 * scale}" width="${s * 0.22 * scale}" height="${s * 0.06 * scale}" rx="${s * 0.022 * scale}" fill="${CREAM}"/>
</svg>`;
}

async function main() {
  // Always write the SVG source, whether or not sharp is available.
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg(512, false));
  console.log("wrote public/icon.svg");

  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log(
      "\nsharp is not installed, so no PNGs were written.\n" +
        "The existing PNGs in public/ are still valid.\n" +
        "To regenerate them: npm i -D sharp && node scripts/gen-icons.js\n"
    );
    return;
  }

  const targets = [
    { size: 192, maskable: false, file: "icon-192.png" },
    { size: 512, maskable: false, file: "icon-512.png" },
    { size: 512, maskable: true, file: "icon-maskable-512.png" },
    { size: 180, maskable: false, file: "apple-touch-icon.png" },
  ];

  for (const target of targets) {
    await sharp(Buffer.from(svg(target.size, target.maskable)))
      .png()
      .toFile(path.join(OUT, target.file));
    console.log(`wrote public/${target.file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
