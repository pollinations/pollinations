import chalk from "chalk";
import { getOutputMode } from "./output.js";

const BRAND_HEX = "#a78bfa";

// Static ASCII rendition of assets/logo.svg at 40x20.
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
