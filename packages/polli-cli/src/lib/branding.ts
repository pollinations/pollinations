import chalk from "chalk";
import { getOutputMode } from "./output.js";

// Brand purple, matches index.ts help styling and the table headers in
// output.ts. One color across the CLI keeps the visual identity consistent.
const BRAND_HEX = "#a78bfa";

// ASCII rendition of the Pollinations flower mark, generated offline by
// rasterizing assets/logo.svg at 40x20 and threshold-converting black
// pixels to '█'. Static so it ships without a build-time dependency on
// ImageMagick or sharp. To regenerate (e.g. if the SVG changes):
//
//   magick assets/logo.svg -resize 40x20! -threshold 50% -monochrome PBM:- \
//     | node -e "<...PBM-to-ASCII script — see PR description...>"
//
// 19 rows × ~40 cols fits comfortably in an 80-column terminal even with a
// few columns of leading indent.
const LOGO_LINES = [
    "                  ████",
    "                ███  ███",
    "               ██      ██",
    "     ███████████        ███████████",
    "     ██      ████      ████      ██",
    "     ██      ██ ███   ██ ██      ██",
    "   ██████    ██   █  ██  ██     █████",
    "███  ██  ██████   ████   ██████  ██  ███",
    " ██   █      ████ ████  ███      ██  ██",
    "  ███  ██      ██████████       ██  ██",
    "    ███████      ██████       ██████",
    "       ███████████████████████████",
    "            ████████████████",
    "            ██████ ██ ███████",
    "         ███       ██       ███",
    "        ███        ██         ██",
    "       █████      ████      █████",
    "       ██ ██     ███ ██     ██ ███",
    "        ███        ███       ███",
];


export function printBanner(subtitle?: string): void {
    if (getOutputMode() !== "human") return;
    if (!process.stderr.isTTY) return;

    const brand = chalk.hex(BRAND_HEX);
    process.stderr.write("\n");
    for (const line of LOGO_LINES) {
        process.stderr.write(`${brand(line)}\n`);
    }
    if (subtitle) {
        process.stderr.write(`\n${chalk.dim(subtitle)}\n`);
    }
    process.stderr.write("\n");
}
