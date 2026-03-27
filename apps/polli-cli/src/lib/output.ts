import chalk from "chalk";

export type OutputMode = "human" | "json" | "quiet";

let currentMode: OutputMode = "human";

export const setOutputMode = (mode: OutputMode) => {
	currentMode = mode;
};

export const getOutputMode = (): OutputMode => currentMode;

/** Print structured data — adapts to current output mode */
export const printResult = (data: unknown) => {
	if (currentMode === "json") {
		process.stdout.write(`${JSON.stringify(data)}\n`);
		return;
	}

	// Arrays: delegate to printTable or print each item
	if (Array.isArray(data)) {
		if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
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

	if (currentMode === "quiet") {
		const values = Object.values(obj).filter(
			(v) => v !== null && v !== undefined,
		);
		for (const v of values) {
			process.stdout.write(`${v}\n`);
		}
		return;
	}

	// human mode — pretty key-value pairs
	const maxKeyLen = Math.max(...Object.keys(obj).map((k) => k.length));
	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;
		const label = chalk.dim(`${key.padEnd(maxKeyLen)}`);
		process.stdout.write(`  ${label}  ${value}\n`);
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
		process.stdout.write(`${JSON.stringify(rows)}\n`);
		return;
	}

	if (currentMode === "quiet") {
		for (const row of rows) {
			const vals = columns
				? columns.map((c) => row[c] ?? "")
				: Object.values(row);
			process.stdout.write(`${vals.join("\t")}\n`);
		}
		return;
	}

	// human mode — aligned columns
	const cols = columns ?? Object.keys(rows[0]);
	const widths = cols.map((col) =>
		Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)),
	);

	// header
	const header = cols.map((c, i) => chalk.bold(c.padEnd(widths[i]))).join("  ");
	process.stdout.write(`  ${header}\n`);
	process.stdout.write(
		`  ${widths.map((w) => "─".repeat(w)).join("  ")}\n`,
	);

	// rows
	for (const row of rows) {
		const line = cols
			.map((c, i) => String(row[c] ?? "").padEnd(widths[i]))
			.join("  ");
		process.stdout.write(`  ${line}\n`);
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
	process.stderr.write(`${chalk.red(`error: ${msg}`)}\n`);
};

/** Warning message — always shown, always stderr */
export const printWarn = (msg: string) => {
	process.stderr.write(`${chalk.yellow(`warn: ${msg}`)}\n`);
};
