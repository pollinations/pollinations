import chalk from "chalk";
import { formatOutputSync } from "./output-formats.js";

export type OutputMode = "human" | "json" | "yaml" | "csv";
let currentMode: OutputMode = "human";
let quietMode = false;
let verboseMode = false;

export const setOutputMode = (mode: OutputMode) => {
    currentMode = mode;
};

export const getOutputMode = (): OutputMode => currentMode;

export const setQuietMode = (quiet: boolean) => {
    quietMode = quiet;
};

export const isQuietMode = (): boolean => quietMode;

export const setVerboseMode = (verbose: boolean) => {
    verboseMode = verbose;
};

export const isVerboseMode = (): boolean => verboseMode;

export const printResult = (data: Record<string, unknown> | unknown[]) => {
    if (currentMode !== "human") {
        const output = formatOutputSync(data, currentMode);
        process.stdout.write(`${output}\n`);
        return;
    }
    if (Array.isArray(data)) {
        printTable(data as Record<string, unknown>[]);
        return;
    }
    for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) continue;
        process.stdout.write(`${chalk.bold(key)}: ${value}\n`);
    }
    if (process.stdout.isTTY) process.stdout.write("\n");
};

export const printTable = (
    rows: Record<string, unknown>[],
    columns?: string[],
) => {
    if (currentMode !== "human") {
        const output = formatOutputSync(rows, currentMode);
        process.stdout.write(`${output}\n`);
        return;
    }
    if (rows.length === 0) {
        printInfo("No results.");
        return;
    }
    const cols = columns ?? Object.keys(rows[0]);
    const stringRows = rows.map((row) => cols.map((c) => String(row[c] ?? "")));
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping for width calculation
    const visibleLen = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").length;
    const widths = cols.map((c, i) =>
        Math.max(c.length, ...stringRows.map((r) => visibleLen(r[i]))),
    );
    const termWidth = process.stdout.columns ?? 0;
    const sepWidth = 2 * (cols.length - 1);
    const lastIdx = cols.length - 1;
    const fixedWidth =
        widths.slice(0, lastIdx).reduce((a, b) => a + b, 0) + sepWidth;
    const lastMax = termWidth > 0 ? termWidth - fixedWidth : Infinity;
    if (lastMax < widths[lastIdx] && lastMax > 3) {
        widths[lastIdx] = lastMax;
        for (const row of stringRows) {
            const cell = row[lastIdx];
            if (visibleLen(cell) > lastMax) {
                // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI strip for safe slicing
                const plain = cell.replace(/\u001b\[[0-9;]*m/g, "");
                row[lastIdx] = `${plain.slice(0, lastMax - 1)}…`;
            }
        }
    }
    const pad = (s: string, w: number, i: number) =>
        i === lastIdx ? s : s + " ".repeat(w - visibleLen(s));
    const brand = chalk.hex("#a78bfa").bold;
    const header = cols.map((c, i) => brand(pad(c, widths[i], i))).join("  ");
    process.stdout.write(`${header}\n`);
    for (const vals of stringRows) {
        const line = vals.map((v, i) => pad(v, widths[i], i)).join("  ");
        process.stdout.write(`${line}\n`);
    }
    if (process.stdout.isTTY) process.stdout.write("\n");
};

export const printInfo = (msg: string) => {
    if (currentMode !== "human" || quietMode) return;
    process.stderr.write(`${chalk.cyan.italic(msg)}\n`);
};

export const printMeta = (data: Record<string, unknown>) => {
    if (currentMode !== "human") {
        const output = formatOutputSync(data, currentMode);
        process.stdout.write(`${output}\n`);
        return;
    }
    if (quietMode) return;
    for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) continue;
        process.stderr.write(`${chalk.bold(key)}: ${value}\n`);
    }
    if (process.stderr.isTTY) process.stderr.write("\n");
};

export const printSuccess = (msg: string) => {
    if (currentMode !== "human" || quietMode) return;
    process.stderr.write(`${chalk.green(msg)}\n`);
};

export const printError = (msg: string) => {
    process.stderr.write(`${chalk.red.bold("error:")} ${chalk.red(msg)}\n`);
};

export const printWarn = (msg: string) => {
    if (currentMode !== "human" || quietMode) return;
    process.stderr.write(
        `${chalk.yellow.bold("warn:")} ${chalk.yellow(msg)}\n`,
    );
};

export const printDebug = (msg: string) => {
    if (!verboseMode) return;
    process.stderr.write(`${chalk.gray.dim(msg)}\n`);
};

export const printVerbose = printDebug;