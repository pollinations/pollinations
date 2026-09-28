/*
 * CLI: regenerate the committed registry entries from the live hosted list,
 * or validate the committed files without touching the network.
 *
 *   node operations/mcp-registry/generate.js            # fetch + rewrite servers/
 *   node operations/mcp-registry/generate.js --validate  # validate committed files
 *
 * The live list GET https://gen.pollinations.ai/mcp is built from
 * shared/registry/mcp.ts, so a server added there is picked up automatically.
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildServerEntry, validateServersDirectory } = require("./registry.js");

const SERVERS_DIR = path.join(__dirname, "servers");
const MCP_LIST_URL = "https://gen.pollinations.ai/mcp";

async function fetchLiveServers() {
    const response = await fetch(MCP_LIST_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) {
        throw new Error(`GET ${MCP_LIST_URL} failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    const servers = payload && Array.isArray(payload.data) ? payload.data : [];
    if (servers.length === 0) {
        throw new Error("the hosted MCP list came back empty");
    }
    return servers;
}

async function main() {
    const validateOnly = process.argv.includes("--validate");
    if (!validateOnly) {
        const servers = await fetchLiveServers();
        fs.mkdirSync(SERVERS_DIR, { recursive: true });
        for (const server of servers) {
            const entry = buildServerEntry(server);
            const file = path.join(SERVERS_DIR, `${server.id}.server.json`);
            fs.writeFileSync(file, `${JSON.stringify(entry, null, 4)}\n`);
            console.log(`wrote ${path.relative(process.cwd(), file)}`);
        }
    }
    const ids = validateServersDirectory(SERVERS_DIR, fs.readdirSync, fs.readFileSync);
    console.log(`validated ${ids.length} registry entries: ${ids.join(", ")}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
