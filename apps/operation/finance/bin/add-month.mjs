#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyIntoInput, readText } from "../lib/io.mjs";
import { parseCsv } from "../lib/parse-csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
    const src = process.argv[2];
    if (!src) {
        console.error("usage: add-month.mjs <path-to-csv>");
        process.exit(1);
    }
    const absSrc = resolve(src);
    const text = await readText(absSrc);
    const rows = parseCsv(text, { filename: absSrc });
    if (rows.length === 0) {
        console.error(`${absSrc}: no rows`);
        process.exit(1);
    }
    const month = rows[0].date.slice(0, 7); // YYYY-MM
    const dest = `${month}.csv`;
    const copied = await copyIntoInput(absSrc, dest);
    console.log(`Copied ${absSrc} → ${copied}`);

    const rebuild = spawn("node", [join(HERE, "rebuild-sheet.mjs")], {
        stdio: "inherit",
    });
    rebuild.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
