#!/usr/bin/env node

// ES module entry point for the Pollinations MCP server.
// Usage:
//   pollinations-mcp              → stdio transport (default)
//   pollinations-mcp --http       → HTTP transport on port 3001
//   pollinations-mcp --http --port 8080

const args = process.argv.slice(2);

if (args.includes("--http")) {
    const portIdx = args.indexOf("--port");
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3001;
    const { startHttpServer } = await import("./src/http-server.js");
    startHttpServer(port);
} else {
    const { startMcpServer } = await import("./src/index.js");
    startMcpServer();
}
