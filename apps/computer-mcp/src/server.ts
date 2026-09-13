import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent computer with one tool: bash. Your files live " +
    "under /workspace; /workspace/README.md explains the memory layout.";

const BASH_DESCRIPTION = `Run a bash command on your private, persistent computer. Files survive between runs, except /tmp, which is emptied after every call. cwd defaults to /workspace and is created if missing; keep one folder per project.

Available: coreutils, grep, sed, awk, jq, tar, find, xargs, diff, curl, git. Not available: Node, Python, package managers. curl and git clone reach any public URL.

Write a file by passing its content in \`stdin\` and running \`cat > path\`; stdin is used as-is, no quoting.

Send files out with \`assets publish <path>\`, which copies one file to media storage and prints an unlisted URL kept 30 days (tar a folder first), or \`git push\` to a repository you own with a token in the remote URL.

Output is stdout and stderr, truncated at 64 KB; a non-zero exit is an error.`;

export const HOME = "/workspace";

const TMP_DIR = "/tmp";
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
                    .describe("Text fed to the command's standard input."),
                cwd: z
                    .string()
                    .optional()
                    .describe("Absolute working directory."),
            },
        },
        async ({ command, stdin, cwd = HOME }, context) => {
            // stdin goes through a file in /tmp, not the runtime's stdin
            // option: @cloudflare/computer 0.3.0 hands stdin to the shell as
            // a latin1 byte string, and a `>` redirect then writes each UTF-8
            // byte as its own character. A file read by `<` stays UTF-8.
            const stdinPath =
                stdin === undefined
                    ? undefined
                    : `${TMP_DIR}/.stdin-${crypto.randomUUID()}`;
            try {
                await workspace.fs
                    .mkdir(cwd, { recursive: true })
                    .catch(() => undefined);
                await workspace.fs.mkdir(TMP_DIR, { recursive: true });
                if (stdinPath !== undefined) {
                    await workspace.fs.writeFile(stdinPath, stdin ?? "");
                }
                const handle = await workspace.runtime.exec(
                    stdinPath === undefined
                        ? command
                        : `{\n${command}\n} < ${stdinPath}`,
                    {
                        cwd,
                        encoding: "utf8",
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
                    // /tmp does not persist: it is emptied after every call.
                    await workspace.fs
                        .rm(TMP_DIR, { recursive: true })
                        .catch(() => undefined);
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
