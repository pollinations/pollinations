import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent computer with one tool: bash. Use worker mode for " +
    "quick shell tasks and container mode for full Linux. Choose a workspace " +
    "for isolated files; /workspace/README.md explains the memory layout.";

const BASH_DESCRIPTION = `Run a bash command in a private, persistent workspace. workspace defaults to "default"; use a stable lowercase name for a separate filesystem. Commands start in /workspace, whose files survive between runs. Use \`cd\` inside the command when needed.

mode defaults to worker: fast startup with coreutils, grep, sed, awk, jq, tar, find, xargs, diff, curl and git, but no Node, Python or package managers. mode=container starts a full Debian container with Node.js, npm, apt, git, native binaries and outbound network; it has a slower cold start. Only /workspace persists when the container restarts.

Write a file by passing its content in \`stdin\` and running \`cat > path\`; stdin is used as-is, no quoting.

In worker mode, send files out with \`assets publish <path>\`, which copies one file to media storage and prints an unlisted URL kept 30 days (tar a folder first). Either mode can use \`git push\` to a repository you own with a token in the remote URL.

Output is stdout and stderr, truncated at 64 KB; a non-zero exit is an error.`;

export const HOME = "/workspace";
export const DEFAULT_WORKSPACE = "default";
export const WORKSPACE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const TMP_DIR = "/tmp";
const MAX_OUTPUT_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;
const BACKEND_BY_MODE = {
    worker: "worker-shell",
    container: "container-shell",
} as const;

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
                workspace: z
                    .string()
                    .regex(WORKSPACE_NAME_PATTERN)
                    .default(DEFAULT_WORKSPACE)
                    .describe(
                        'Persistent filesystem name; defaults to "default". Use 1-64 lowercase letters, numbers, dots, underscores or hyphens.',
                    ),
                mode: z
                    .enum(["worker", "container"])
                    .optional()
                    .describe(
                        "worker (default) for fast shell tasks; container for full Debian with Node.js, npm, apt and native binaries.",
                    ),
            },
        },
        async ({ command, stdin, mode = "worker" }, context) => {
            // stdin goes through a file in /tmp, not the runtime's stdin
            // option: @cloudflare/computer 0.3.0 hands stdin to the shell as
            // a latin1 byte string, and a `>` redirect then writes each UTF-8
            // byte as its own character. A file read by `<` stays UTF-8. The
            // container backend accepts UTF-8 stdin directly.
            const stdinPath =
                stdin === undefined || mode === "container"
                    ? undefined
                    : `${TMP_DIR}/.stdin-${crypto.randomUUID()}`;
            try {
                if (mode === "worker") {
                    await workspace.fs.mkdir(TMP_DIR, { recursive: true });
                }
                if (stdinPath !== undefined) {
                    await workspace.fs.writeFile(stdinPath, stdin ?? "");
                }
                const handle = await workspace.runtime.exec(
                    stdinPath === undefined
                        ? command
                        : `{\n${command}\n} < ${stdinPath}`,
                    {
                        backend: BACKEND_BY_MODE[mode],
                        cwd: HOME,
                        encoding: "utf8",
                        ...(mode === "container" && stdin !== undefined
                            ? { stdin }
                            : {}),
                        timeoutMs: COMMAND_TIMEOUT_MS,
                    },
                );
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
                    if (mode === "worker") {
                        // The worker shell's /tmp does not persist.
                        await workspace.fs
                            .rm(TMP_DIR, { recursive: true })
                            .catch(() => undefined);
                    }
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
