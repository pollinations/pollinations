// Turns shared/registry/mcp.ts into one server.json per hosted MCP server, in
// the official MCP registry's format (https://modelcontextprotocol.io/registry).
// Adding a server to that file is enough for it to reach the registry on the
// next publish — nobody hand-writes an entry.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MCP_SERVERS } from "../../shared/registry/mcp.ts";
import { buildServerEntry } from "../../shared/registry/mcp-server-json.ts";

function main() {
    const [outDir, version] = process.argv.slice(2);
    if (!outDir || !version?.trim()) {
        console.error(
            "Usage: node generate-server-json.ts <output-dir> <version>",
        );
        process.exit(1);
    }
    mkdirSync(outDir, { recursive: true });
    for (const server of MCP_SERVERS) {
        const path = join(outDir, `${server.id}.json`);
        writeFileSync(
            path,
            `${JSON.stringify(buildServerEntry(server, version), null, 4)}\n`,
        );
        console.log(`Wrote ${path}`);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}
