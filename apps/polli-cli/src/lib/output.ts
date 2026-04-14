import chalk from "chalk";

export type OutputMode = "human" | "json";

let currentMode: OutputMode = "human";

export const setOutputMode = (mode: OutputMode) => {
    currentMode = mode;
};

export const getOutputMode = (): OutputMode => currentMode;

/** Print structured data — adapts to current output mode */
export const printResult = (data: unknown) => {
    if (currentMode === "json") {
        process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
        return;
    }

    // Arrays: delegate to printTable or print each item
    if (Array.isArray(data)) {
        if (
            data.length > 0 &&
            typeof data[0] === "object" &&
            data[0] !== null
        ) {
            printTable(data as Record<string, unknown>[]);
        } else {
            for (const item of data) {
                process.stdout.write(`${item}\n`);
            }
        }
        return;
    }

    if (typeof data !== "object" || data === null) {
        process.stdout.write(`${data}\n`);
        return;
    }

    const obj = data as Record<string, unknown>;

    // key: value pairs, one per line
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        process.stdout.write(`${chalk.bold(key)}: ${value}\n`);
    }
};

/** Print a list of objects as a table */
export const printTable = (
    rows: Record<string, unknown>[],
    columns?: string[],
) => {
    if (rows.length === 0) {
        printInfo("No results.");
        return;
    }

    if (currentMode === "json") {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
        return;
    }

    // Space-padded columns. Visible width = string length minus ANSI escapes.
    const cols = columns ?? Object.keys(rows[0]);
    const stringRows = rows.map((row) => cols.map((c) => String(row[c] ?? "")));
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping for width calculation
    const visibleLen = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").length;
    const widths = cols.map((c, i) =>
        Math.max(c.length, ...stringRows.map((r) => visibleLen(r[i]))),
    );
    const lastIdx = cols.length - 1;
    const pad = (s: string, w: number, i: number) =>
        i === lastIdx ? s : s + " ".repeat(w - visibleLen(s));
    const brand = chalk.hex("#a78bfa").bold;
    const header = cols.map((c, i) => brand(pad(c, widths[i], i))).join("  ");
    process.stdout.write(`${header}\n`);
    for (const vals of stringRows) {
        const line = vals.map((v, i) => pad(v, widths[i], i)).join("  ");
        process.stdout.write(`${line}\n`);
    }
};

/** Info message — only shown in human mode, goes to stderr */
export const printInfo = (msg: string) => {
    if (currentMode !== "human") return;
    process.stderr.write(`${chalk.dim(msg)}\n`);
};

/** Success message — shown in human mode on stderr */
export const printSuccess = (msg: string) => {
    if (currentMode !== "human") return;
    process.stderr.write(`${chalk.green(msg)}\n`);
};

/** Error message — always shown, always stderr */
export const printError = (msg: string) => {
    process.stderr.write(`${chalk.red.bold("error:")} ${chalk.red(msg)}\n`);
};

/** Warning message — always shown, always stderr */
export const printWarn = (msg: string) => {
    process.stderr.write(
        `${chalk.yellow.bold("warn:")} ${chalk.yellow(msg)}\n`,
    );
};
