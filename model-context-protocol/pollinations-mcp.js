#!/usr/bin/env node

// This is an ES module entry point for the Pollinations MCP server
import { startMcpServer } from "./src/index.js";
import { installClaudeMcp } from "./src/scripts/install-claude.js";

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes("install-claude-mcp")) {
    console.log("🚀 Installing Pollinations MCP to Claude Desktop...");
    installClaudeMcp().catch(error => {
        console.error("❌ Installation failed:", error);
        process.exit(1);
    });
} else {
    // Default behavior: Run the Server
    startMcpServer();
}
