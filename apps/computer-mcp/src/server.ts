import type { WorkspaceClient } from "@cloudflare/computer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SERVER_INSTRUCTIONS =
    "A private, persistent computer with one tool: bash. Your files live " +
    "under /workspace and survive between runs. Read /workspace/README.md " +
    "first; it explains the memory layout and how to import and share files.";

const BASH_DESCRIPTION = `Run a bash command on your private, persistent computer. Everything you write survives between runs, except /tmp, which is emptied after every call; keep one folder per project under /workspace (the default cwd), e.g. /workspace/thesis. The cwd folder is created if missing.

Available: coreutils, grep, sed, awk, jq, tar, find, xargs, diff, curl (HTTP and HTTPS) and git (init, add, commit, log, diff, status, clone, pull, push over HTTPS). Not available: Node, Python, npm, apt.

To write a file, put its content in \`stdin\` and run \`cat > path\`; the content is passed as-is, no quoting or heredoc needed. Anything that reads standard input (sed, jq, tee, git apply) works the same way. Edit with sed -i or rewrite the file.

Import: \`curl -o <path> <url>\` downloads any public URL; \`git clone <https-url>\` fetches any public repository. Share: \`assets publish <path>\` copies one file to public media storage and prints its URL (a snapshot, unlisted, kept 30 days; tar a folder first); \`git push\` to a repository the user owns, with their token in the remote URL. Output is stdout and stderr, truncated at 64 KB; use head, tail or grep for long output. A non-zero exit code is reported as an error.`;

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
                    .describe(
                        "Text fed to the command's standard input, e.g. " +
                            "file content for `cat > path`.",
                    ),
                cwd: z
                    .string()
                    .optional()
                    .describe(
                        "Absolute working directory, created if missing. " +
                            "Defaults to /workspace.",
                    ),
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
