/**
 * pollinations.ai MCP stdio entry point
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "./server.js";
import { validateApiBaseUrl } from "./utils/coreUtils.js";

const SERVER_VERSION = createRequire(import.meta.url)(
    "../package.json",
).version;

export { buildServer } from "./server.js";

export async function startMcpServer() {
    try {
        const apiBaseUrl = validateApiBaseUrl();

        process.on("uncaughtException", (error) => {
            console.error(`Uncaught exception: ${error.message}`);
            process.exit(1);
        });

        process.on("unhandledRejection", (reason) => {
            console.error(`Unhandled rejection: ${reason}`);
        });

        process.on("SIGINT", () => process.exit(0));
        process.on("SIGTERM", () => process.exit(0));
        process.stdin.on("close", () => process.exit(0));

        serveStdio(
            () =>
                buildServer({
                    apiBaseUrl,
                    version: SERVER_VERSION,
                }),
            {
                onerror: (error) => {
                    console.error(`Server error: ${error.message}`);
                },
            },
        );

        console.error(
            `Pollinations MCP Server v${SERVER_VERSION} running on stdio`,
        );
        console.error(`API: ${apiBaseUrl}`);
    } catch (error) {
        console.error(`Failed to start MCP server: ${error.message}`);
        process.exit(1);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    startMcpServer();
}
