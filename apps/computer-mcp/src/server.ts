import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A persistent computer with one tool: bash. /workspace is your private " +
    "computer; /public is one computer shared with every Pollinations user. " +
    "The `cwd` argument picks which one you are on. Read the README.md in " +
    "the root of the computer you use first.";

const BASH_DESCRIPTION = `Run a bash command on a persistent computer. \`cwd\` under /workspace (the default) runs on your private computer: keep one folder per project there, e.g. /workspace/thesis. \`cwd\` under /public runs on a computer shared with every Pollinations user: anyone can read, change or delete those files. A command sees only the computer its cwd is on; move files between them with \`assets publish\` and \`curl\`. The cwd folder is created if missing.

Available: coreutils, grep, sed, awk, jq, tar, find, xargs, diff, curl (HTTP and HTTPS) and git (init, add, commit, log, diff, status, clone over HTTPS). Not available: Node, Python, npm, apt.

To write a file, put its content in \`stdin\` and run \`cat > path\`; the content is passed as-is, no quoting or heredoc needed. Anything that reads standard input (sed, jq, tee, git apply) works the same way. Edit with sed -i or rewrite the file. \`assets publish <path>\` copies a file to public media storage and prints its URL (a snapshot; publish again after changes); \`curl -o <path> <url>\` downloads a file, e.g. an image the user generated. Output is stdout and stderr, truncated at 64 KB; use head, tail or grep for long output. A non-zero exit code is reported as an error.`;

export const PRIVATE_ROOT = "/workspace";
export const PUBLIC_ROOT = "/public";

// Which computer a working directory lives on. Everything under /public is
// the one shared computer; everything else is the caller's private one.
export function isPublicPath(cwd: string): boolean {
    return cwd === PUBLIC_ROOT || cwd.startsWith(`${PUBLIC_ROOT}/`);
}

const MAX_OUTPUT_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;

export function createComputerMcpServer(workspace: WorkspaceClient): McpServer {
    const server = new McpServer(
        { name: "computer", version: "0.1.0" },
        { instructions: SERVER_INSTRUCTIONS },
    );
    server.registerTool(
        "bash",
        {
            description: BASH_DESCRIPTION,
            inputSchema: {
                command: z.string().describe("The bash command to run."),
                stdin: z
                    .string()
                    .optional()
                    .describe(
                        "Text fed to the command's standard input, e.g. " +
                            "file content for `cat > path`.",
                    ),
                cwd: z
                    .string()
                    .optional()
                    .describe(
                        "Absolute working directory; created if missing. " +
                            "Under /workspace (default) it is your private " +
                            "computer, under /public the shared one.",
                    ),
            },
        },
        async ({ command, stdin, cwd = PRIVATE_ROOT }, context) => {
            try {
                await workspace.fs
                    .mkdir(cwd, { recursive: true })
                    .catch(() => undefined);
                const handle = await workspace.runtime.exec(command, {
                    cwd,
                    stdin,
                    encoding: "utf8",
                    timeoutMs: COMMAND_TIMEOUT_MS,
                });
                const onAbort = () => void handle.kill().catch(() => undefined);
                context.signal.addEventListener("abort", onAbort, {
                    once: true,
                });
                try {
                    const result = await handle.result();
                    return {
                        isError: result.exitCode !== 0,
                        content: [
                            {
                                type: "text",
                                text: formatOutput(
                                    result.exitCode,
                                    result.stdout,
                                    result.stderr,
                                ),
                            },
                        ],
                    };
                } finally {
                    context.signal.removeEventListener("abort", onAbort);
                }
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    ],
                };
            }
        },
    );
    return server;
}

function formatOutput(exitCode: number, stdout: string, stderr: string) {
    const parts = [truncate(stdout)];
    if (stderr.length > 0) parts.push(`[stderr]\n${truncate(stderr)}`);
    if (exitCode !== 0) parts.push(`[exit code ${exitCode}]`);
    return parts.join("\n");
}

function truncate(text: string): string {
    if (text.length <= MAX_OUTPUT_BYTES) return text;
    return `${text.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
}
