import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, ".dev.vars");
const overridePath = resolve(root, ".dev.vars.local");

const parseEnv = (text) => {
    const vars = new Map();

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (!line || line.startsWith("#")) {
            continue;
        }

        const separator = line.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1);

        vars.set(key, value);
    }

    return vars;
};

const serializeEnv = (vars) =>
    `${Array.from(vars.entries(), ([key, value]) => `${key}=${value}`).join("\n")}\n`;

const baseEnvText = execFileSync(
    "sops",
    ["decrypt", "secrets/dev.vars.json", "--output-type", "dotenv"],
    {
        cwd: root,
        encoding: "utf8",
    },
);

const mergedVars = parseEnv(baseEnvText);

if (existsSync(overridePath)) {
    const overrideText = readFileSync(overridePath, "utf8");
    for (const [key, value] of parseEnv(overrideText)) {
        mergedVars.set(key, value);
    }
}

writeFileSync(outputPath, serializeEnv(mergedVars));
