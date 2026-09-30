import { spawnSync } from "node:child_process";
import { Command, InvalidArgumentError } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL, setKeyOverride } from "../../lib/config.js";
import { fail, printResult, printSuccess } from "../../lib/output.js";
import {
    createSandbox,
    E2B_PATH,
    LEASE_SECONDS,
    setSandboxTimeout,
} from "./e2b.js";
import { proxy, setupSsh } from "./ssh.js";

// E2B's own CLI runs every command polli doesn't add. Pinned, so it calls
// only the endpoints gen forwards.
const E2B_CLI = "@e2b/cli@2.20.0";
// E2B commands that can print JSON, for polli's --json.
const JSON_COMMANDS = ["list", "info", "logs", "metrics"];

// Whole seconds, as in `e2b sandbox create --timeout`.
function parseSeconds(value: string): number {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1) {
        throw new InvalidArgumentError("Give a whole number of seconds.");
    }
    return seconds;
}

const time = (secondsFromNow: number) =>
    new Date(Date.now() + secondsFromNow * 1000).toLocaleString();

export const sandboxCommand = new Command("sandbox")
    .description("E2B sandboxes billed to your Pollinations account (alpha)")
    .addCommand(
        new Command("create")
            .description("Start a sandbox you can ssh into")
            .argument("[template]", "E2B template", "base")
            .option(
                "--timeout <seconds>",
                "keep it running this long, paid in advance",
                parseSeconds,
                LEASE_SECONDS,
            )
            .action(
                async (template: string, { timeout }: { timeout: number }) => {
                    requireKey();
                    try {
                        const { sandboxID } = await createSandbox(
                            template,
                            timeout,
                        );
                        setupSsh();
                        printSuccess(
                            `Sandbox ${sandboxID} created. It runs until ${time(timeout)}, or ${LEASE_SECONDS / 60} minutes after the last ssh session, then pauses.`,
                        );
                        printResult({
                            id: sandboxID,
                            ssh: `ssh ${sandboxID}.polli`,
                        });
                    } catch (err) {
                        fail("Failed to create sandbox", err);
                    }
                },
            ),
    )
    .addCommand(
        new Command("timeout")
            .description(
                "Keep a sandbox running until <seconds> from now, paid in advance",
            )
            .argument("<id>")
            .argument("<seconds>", "seconds from now", parseSeconds)
            .action(async (id: string, seconds: number) => {
                requireKey();
                try {
                    await setSandboxTimeout(id, seconds);
                    printSuccess(
                        `Sandbox ${id} runs until ${time(seconds)}, then pauses.`,
                    );
                } catch (err) {
                    fail(`Failed to set the timeout of sandbox ${id}`, err);
                }
            }),
    )
    .addCommand(
        new Command("ssh-config")
            .description(
                "Set up ssh to <sandbox-id>.polli (create does this for you)",
            )
            .action(() => {
                try {
                    setupSsh();
                    printSuccess(
                        "ssh, scp and rsync now reach <sandbox-id>.polli",
                    );
                } catch (err) {
                    fail("Failed to set up ssh", err);
                }
            }),
    )
    .addCommand(
        new Command("proxy")
            .description("ssh ProxyCommand for <sandbox-id>.polli")
            .argument("<host>")
            .action(async (host: string) => {
                requireKey();
                try {
                    await proxy(host);
                } catch (err) {
                    fail(`Could not reach sandbox ${host}`, err);
                }
            }),
        { hidden: true },
    )
    .addHelpText(
        "after",
        `
Any other command runs E2B's CLI (npx ${E2B_CLI}) with your key:
  polli sandbox list | kill <id> | exec <id> <cmd> | logs <id>
  polli sandbox pause <id> | resume <id> | info <id> | metrics <id>`,
    )
    .on("command:*", (operands: string[], unknown: string[]) => {
        const { json, key } = sandboxCommand.optsWithGlobals();
        if (key) setKeyOverride(key);
        const args = [...operands, ...unknown];
        if (json && JSON_COMMANDS.includes(args[0])) {
            args.push("--format", "json");
        }
        const { status } = spawnSync(
            "npx",
            ["-y", E2B_CLI, "sandbox", ...args],
            {
                stdio: "inherit",
                shell: process.platform === "win32",
                env: {
                    ...process.env,
                    E2B_API_URL: `${BASE_URL}${E2B_PATH}`,
                    E2B_API_KEY: requireKey(),
                },
            },
        );
        process.exit(status ?? 1);
    });
