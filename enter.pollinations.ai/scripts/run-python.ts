#!/usr/bin/env npx tsx

import { spawnSync } from "node:child_process";
import { getPythonBin, getPythonEnv } from "./user-pipeline/shared/python.ts";

const [script, ...args] = process.argv.slice(2);
if (!script) {
    console.error("❌ Missing Python script path");
    process.exit(1);
}

const pythonBin = getPythonBin();
const result = spawnSync(pythonBin, [script, ...args], {
    stdio: "inherit",
    env: getPythonEnv(),
});

if (result.error) {
    console.error(result.error);
    process.exit(1);
}

process.exit(result.status ?? 1);
