/**
 * Writes one `server.json` per hosted MCP server, which is what
 * `mcp-publisher` validates and publishes.
 *
 * Usage:
 *   node operations/mcp-registry/emit.mts --out <dir> [--version <version>] [--commit <sha>]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
    buildRegistryEntries,
    type McpRegistryEntry,
    type RegistryEntryOptions,
} from "./entries.mts";

const USAGE =
    "Usage: node operations/mcp-registry/emit.mts --out <dir> [--version <version>] [--commit <sha>]";

export type EmitOptions = RegistryEntryOptions & { out: string };

export function parseArgs(argv: string[]): EmitOptions {
    const options: EmitOptions = { out: "" };

    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];

        if (flag === "--help") {
            console.log(USAGE);
            process.exit(0);
        }
        if (!["--out", "--version", "--commit"].includes(flag)) {
            throw new Error(`Unknown argument: ${flag}\n${USAGE}`);
        }

        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`${flag} needs a value\n${USAGE}`);
        }
        index += 1;

        if (flag === "--out") {
            options.out = value;
        } else if (flag === "--version") {
            options.version = value;
        } else {
            options.commit = value;
        }
    }

    if (!options.out) {
        throw new Error(`--out is required\n${USAGE}`);
    }

    return options;
}

/** The server id is the part of the registry name after the namespace. */
export function registryServerId(entry: McpRegistryEntry): string {
    return entry.name.slice(entry.name.indexOf("/") + 1);
}

export function entryFilePath(out: string, entry: McpRegistryEntry): string {
    return join(out, registryServerId(entry), "server.json");
}

export function writeRegistryEntries(
    entries: McpRegistryEntry[],
    out: string,
): string[] {
    return entries.map((entry) => {
        const file = entryFilePath(out, entry);
        mkdirSync(join(out, registryServerId(entry)), { recursive: true });
        writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
        return file;
    });
}

function main(): void {
    const options = parseArgs(process.argv.slice(2));
    const out = resolve(options.out);
    const entries = buildRegistryEntries(options);
    const files = writeRegistryEntries(entries, out);

    for (const [index, entry] of entries.entries()) {
        const remote = entry.remotes[0];
        console.log(
            `${entry.name} ${entry.version} -> ${remote.url} (${entry.description.length} char description) ${files[index]}`,
        );
    }

    console.log("");
    console.log(`Wrote ${files.length} registry entries to ${out}`);
    console.log(
        `Validate them with: for entry in ${out}/*/; do (cd "$entry" && mcp-publisher validate); done`,
    );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main();
}
