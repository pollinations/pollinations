#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(HERE, "rebuild-sheet.mjs")], {
    stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
