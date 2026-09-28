#!/usr/bin/env node
/**
 * Generate MCP Registry server.json entries for every hosted Pollinations
 * MCP server, from the public source of truth GET https://gen.pollinations.ai/mcp
 * (built from shared/registry/mcp.ts). A server added there reaches the
 * registry on the next publish with no hand-written entry.
 *
 * Usage:
 *   node operations/mcp-registry/generate.mjs <output-dir> [--version 1.0.0]
 *                                                  [--base-url https://gen.pollinations.ai]
 *
 * Output: <output-dir>/<server-id>/server.json (one directory per server,
 * matching what `mcp-publisher publish` expects as its working directory).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_URL =
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const REPOSITORY_URL = "https://github.com/pollinations/pollinations";
const SETUP_DOCS_URL = "https://gen.pollinations.ai/docs#tag/mcp-servers";
const API_KEY_URL = "https://enter.pollinations.ai/keys";

function parseArgs(argv) {
    const [outDir] = argv;
    if (!outDir) {
        console.error(
            "usage: generate.mjs <output-dir> [--version 1.0.0] [--base-url https://gen.pollinations.ai]",
        );
        process.exit(1);
    }
    const options = {
        outDir,
        version: "1.0.0",
        baseUrl: "https://gen.pollinations.ai",
    };
    for (let i = 1; i < argv.length; i += 2) {
        if (argv[i] === "--version") options.version = argv[i + 1];
        else if (argv[i] === "--base-url") options.baseUrl = argv[i + 1];
        else {
            console.error(`unknown option: ${argv[i]}`);
            process.exit(1);
        }
    }
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(options.version)) {
        console.error(`--version must be semver, got: ${options.version}`);
        process.exit(1);
    }
    return options;
}

// The registry schema caps the top-level description at 100 characters.
// Trim on a word boundary so entries never end mid-word.
function fitDescription(text, maxLength = 100) {
    if (text.length <= maxLength) {
        return { description: text, trimmed: false };
    }
    const cut = text.slice(0, maxLength);
    const description = cut.slice(0, cut.lastIndexOf(" ")).trimEnd();
    return { description, trimmed: true };
}

const { outDir, version, baseUrl } = parseArgs(process.argv.slice(2));

const response = await fetch(`${baseUrl}/mcp`);
if (!response.ok) {
    throw new Error(`GET ${baseUrl}/mcp -> ${response.status}`);
}
const { data: servers } = await response.json();
if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("GET /mcp returned no servers");
}

let count = 0;
for (const server of servers) {
    const { description, trimmed } = fitDescription(server.description);
    if (trimmed) {
        console.log(
            `${server.id}: description shortened to 100 chars for the registry`,
        );
    }
    const entry = {
        $schema: SCHEMA_URL,
        name: `io.github.pollinations/${server.id}`,
        title: server.name,
        description,
        version,
        repository: {
            url: REPOSITORY_URL,
            source: "github",
        },
        websiteUrl: SETUP_DOCS_URL,
        remotes: [
            {
                type: "streamable-http",
                url: server.url,
                headers: [
                    {
                        name: "Authorization",
                        value: "Bearer {pollinations_api_key}",
                        description: `Pollinations API key as a Bearer token. Get one at ${API_KEY_URL}; setup: ${SETUP_DOCS_URL}`,
                        isRequired: true,
                        variables: {
                            pollinations_api_key: {
                                description:
                                    "Pollinations API key (sk_ or pk_)",
                                isRequired: true,
                                isSecret: true,
                            },
                        },
                    },
                ],
            },
        ],
    };
    const dir = path.join(outDir, server.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "server.json"),
        `${JSON.stringify(entry, null, 4)}\n`,
    );
    console.log(`generated ${entry.name} -> ${server.url}`);
    count += 1;
}
console.log(`${count} server.json entries written to ${outDir}`);
