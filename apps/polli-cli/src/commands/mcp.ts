import { Command } from "commander";
import { printInfo, printTable } from "../lib/output.js";
import { pollyTools } from "../mcp/tools.js";

export const mcpCommand = new Command("mcp")
    .description(
        "Start Polly as an MCP server (stdio) for AI agent consumption",
    )
    .option("--list-tools", "Show available MCP tools and exit")
    .action(async (opts) => {
        if (opts.listTools) {
            printTable(
                pollyTools.map((t) => ({
                    tool: t.name,
                    description: t.description.slice(0, 80),
                })),
            );
            return;
        }

        printInfo("Starting Polly MCP server on stdio...");
        printInfo("Connect from Claude Desktop, Cursor, or any MCP client.");
        printInfo("");

        // Dynamic import to avoid loading MCP deps for non-mcp commands
        const { startPollyMcp } = await import("../mcp/server.js");
        await startPollyMcp();
    });
