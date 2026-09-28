#!/usr/bin/env node
/**
 * Validate generated server.json entries against the official MCP registry
 * schema (downloaded fresh). Usage: node validate.mjs <dir-with-server-json>
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_URL =
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const dir = process.argv[2];
if (!dir) {
    console.error("usage: validate.mjs <dir-with-server-json>");
    process.exit(1);
}

const schema = JSON.parse(await (await fetch(SCHEMA_URL)).text());
const { default: Ajv } = await import("ajv");
// strict: false — the registry schema uses the non-standard `example` keyword.
// ajv-formats enforces the `uri` formats the schema declares.
const validate = new Ajv({ strict: false, allErrors: true });
try {
    const { default: addFormats } = await import("ajv-formats");
    addFormats(validate);
} catch {}
const compiled = validate.compile(schema);

let failed = false;
for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, "server.json");
    const serverJson = JSON.parse(await readFile(file, "utf8"));
    if (compiled(serverJson)) {
        console.log(
            `PASS ${file}: ${serverJson.name} -> ${serverJson.remotes[0].url}`,
        );
    } else {
        failed = true;
        console.error(`FAIL ${file}:`);
        console.error(JSON.stringify(compiled.errors, null, 2));
    }
}
if (failed) process.exit(1);
console.log("all entries valid");
