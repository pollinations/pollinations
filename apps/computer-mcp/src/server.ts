import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent computer with one tool: bash. Files under " +
    "/workspace survive between runs. Read /workspace/README.md first; it " +
    "explains the memory layout. Every call takes an optional `session` " +
    "name; each session is a separate computer with its own files.";

const BASH_DESCRIPTION = `Run a bash command on your private, persistent computer. Everything under /workspace survives between runs; nothing else persists.

Available: coreutils, grep, sed, awk, jq, tar, find, xargs, diff and git (init, add, commit, log, diff, status, clone over HTTPS). Not available: outbound network, Node, Python, npm, apt.

To write a file, put its content in \`stdin\` and run \`cat > /workspace/path\`; the content is passed as-is, no quoting or heredoc needed. Anything that reads standard input (sed, jq, tee, git apply) works the same way. Edit with sed -i or rewrite the file. Output is stdout and stderr, truncated at 64 KB; use head, tail or grep for long output. A non-zero exit code is reported as an error.`;

// Session names become part of the Durable Object key; keep them short slugs.
export const SESSION_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const DEFAULT_SESSION = "default";

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
                    .describe("Working directory. Defaults to /workspace."),
                session: z
                    .string()
                    .regex(SESSION_NAME)
                    .optional()
                    .describe(
                        "Session to run in. Each session is an isolated " +
                            "computer; omit for the default session.",
                    ),
            },
        },
        async ({ command, stdin, cwd }, context) => {
            try {
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
