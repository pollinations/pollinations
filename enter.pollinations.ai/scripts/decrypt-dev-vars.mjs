import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, ".dev.vars");
const overridePath = resolve(root, ".dev.vars.override");

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

let baseEnvText;
try {
    baseEnvText = execFileSync(
        "sops",
        ["decrypt", "secrets/dev.vars.json", "--output-type", "dotenv"],
        {
            cwd: root,
            encoding: "utf8",
            stdio: "pipe",
        },
    );
} catch (error) {
    // Contributors have no sops (ENOENT) or no maintainer key (sops exits 128):
    // keep their own .dev.vars instead of failing.
    if (error.code !== "ENOENT" && error.status !== 128) throw error;
    if (existsSync(outputPath)) {
        console.log("No SOPS key for secrets/dev.vars.json; keeping .dev.vars");
    } else {
        copyFileSync(resolve(root, ".dev.vars.example"), outputPath);
        console.log(
            "No SOPS key for secrets/dev.vars.json; created .dev.vars from .dev.vars.example",
        );
    }
    process.exit(0);
}

const mergedVars = parseEnv(baseEnvText);

if (existsSync(overridePath)) {
    const overrideText = readFileSync(overridePath, "utf8");
    for (const [key, value] of parseEnv(overrideText)) {
        mergedVars.set(key, value);
    }
}

writeFileSync(outputPath, serializeEnv(mergedVars));
