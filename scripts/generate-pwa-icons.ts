/**
 * PWA icons.  `npm run icons:generate`
 *
 * Renders the app mark to PNG at every size a home screen asks for.
 * Written as a script rather than checked-in binaries so the mark can be
 * changed in one place and the icons regenerated.
 *
 * Uses `sharp` if it is installed; otherwise it writes the SVGs and says
 * so, because a missing optional dependency should not fail a build.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");

/** The mark, matching <Logo /> in src/components/brand.tsx. */
function markSvg(size: number, maskable: boolean): string {
  // Maskable icons need their content inside the safe zone (the middle
  // 80%), or Android will crop the gear when it applies its own shape.
  const pad = maskable ? size * 0.1 : 0;
  const inner = size - pad * 2;
  const scale = inner / 32;
  const radius = maskable ? 0 : size * 0.22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#17547f"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})"
     fill="none" stroke="#ffffff" stroke-width="1.9"
     stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="16" r="7.5"/>
    <circle cx="16" cy="16" r="2.6"/>
    <path d="M16 8.5v2.2"/>
    <path d="M16 21.3v2.2"/>
    <path d="M8.5 16h2.2"/>
    <path d="M21.3 16h2.2"/>
    <path d="m10.7 10.7 1.6 1.6"/>
    <path d="m19.7 19.7 1.6 1.6"/>
    <path d="m21.3 10.7-1.6 1.6"/>
    <path d="m12.3 19.7-1.6 1.6"/>
  </g>
</svg>`;
}

const SIZES: { size: number; name: string; maskable: boolean }[] = [
  { size: 192, name: "icon-192.png", maskable: false },
  { size: 512, name: "icon-512.png", maskable: false },
  { size: 192, name: "icon-192-maskable.png", maskable: true },
  { size: 512, name: "icon-512-maskable.png", maskable: true },
  { size: 180, name: "apple-touch-icon.png", maskable: false },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  // The SVG is always written: it is the source of truth for the mark.
  await writeFile(join(OUT, "icon.svg"), markSvg(512, false), "utf8");
  await writeFile(join(OUT, "icon-maskable.svg"), markSvg(512, true), "utf8");

  let sharp: (typeof import("sharp"))["default"] | null = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.log(
      "\n  sharp is not installed, so only the SVG masters were written.\n" +
        "  Run `npm i -D sharp` then `npm run icons:generate` for the PNGs.\n",
    );
    return;
  }

  for (const { size, name, maskable } of SIZES) {
    const png = await sharp(Buffer.from(markSvg(size, maskable))).png().toBuffer();
    await writeFile(join(OUT, name), png);
    console.log(`  ${name.padEnd(28)} ${size}x${size}`);
  }

  console.log("\n  Icons written to public/icons.\n");
}

main().catch((err) => {
  console.error(`\n  Icon generation failed: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
