import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent Linux computer. Run commands with bash and share " +
    "files with publish_file. Choose a workspace " +
    "for isolated files; managed agents are isolated from one another " +
    "automatically. /workspace/README.md explains the memory layout.";

const BASH_DESCRIPTION = `Run a bash command in a private, persistent workspace. Each managed agent gets its own computer for each caller automatically. workspace defaults to "default"; use a stable lowercase name for an additional filesystem inside that computer. Commands start in /workspace, whose files survive between runs. Use \`cd\` inside the command when needed.

Commands run in a Debian container with Node.js, npm, apt, git, native binaries and outbound network. The first command starts the container; it stops after five minutes without commands. Only /workspace persists when the container restarts; install project dependencies there. Background processes stop with the container.

The owner can reach a server you start on a port (1024-65535, not 8080 or 2222) at https://gen.pollinations.ai/computer/<workspace>/ports/<port>/ with their key. Put the command that starts it in /workspace/start.sh; it runs when a request finds the port closed. The owner can also SSH in once their public key is in /workspace/.ssh/authorized_keys.

Write a file by passing its content in \`stdin\` and running \`cat > path\`; stdin is used as-is, no quoting.

Send files out with the publish_file tool, which copies one file to media storage and returns an unlisted URL kept 30 days (tar a folder first). You can also use \`git push\` to a repository you own with a token in the remote URL.

Output is stdout and stderr, truncated at 64 KB; a non-zero exit is an error.`;

export const HOME = "/workspace";
export const DEFAULT_WORKSPACE = "default";
export const WORKSPACE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const MAX_OUTPUT_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;
const workspaceSchema = z
    .string()
    .regex(WORKSPACE_NAME_PATTERN)
    .default(DEFAULT_WORKSPACE)
    .describe(
        'Persistent filesystem name; defaults to "default". Use 1-64 lowercase letters, numbers, dots, underscores or hyphens.',
    );

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
                    .describe("Text fed to the command's standard input."),
                workspace: workspaceSchema,
            },
        },
        async ({ command, stdin }, context) => {
            try {
                const handle = await workspace.runtime.exec(command, {
                    cwd: HOME,
                    encoding: "utf8",
                    ...(stdin !== undefined ? { stdin } : {}),
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
    server.registerTool(
        "publish_file",
        {
            description:
                "Copy a file from /workspace to media storage and return an unlisted URL kept for 30 days. Use the same workspace as the bash command that created the file.",
            inputSchema: {
                path: z.string().regex(/^\/workspace\//),
                workspace: workspaceSchema,
            },
        },
        async ({ path }) => ({
            content: [
                {
                    type: "text" as const,
                    text: await workspace.assets.share(path, {}),
                },
            ],
        }),
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
