import chalk from "chalk";
import { getOutputMode } from "./output.js";

// Brand purple, matches index.ts help styling and the table headers in
// output.ts. One color across the CLI keeps the visual identity consistent.
const BRAND_HEX = "#a78bfa";

// Hand-crafted small ASCII rendition of the Pollinations mark — a stylized
// flower / sun motif derived from assets/logo.svg. Kept short (6 lines × 30
// cols) so it fits comfortably in 80-column terminals and tmux/Vim splits.
const LOGO_LINES = [
    "    .-=+*#%@%#*+=-.",
    "  -*%@@@@@@@@@@@@@%*-",
    " #@@@@@@   *@   @@@@@@#",
    "%@@@@@@@@@@@@@@@@@@@@@@%",
    " #@@@@@@@@@@@@@@@@@@@@#",
    "  -*%@@@@@@@@@@@@@@%*-",
    "    .-=+*#%@%#*+=-.",
];

/**
 * Print the Pollinations banner to stderr, brand-purple, with an optional
 * subtitle dimmed underneath. No-op in JSON mode so structured callers stay
 * clean. No-op when stderr is not a TTY (piped output stays free of escape
 * sequences and ASCII filler).
 */
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
