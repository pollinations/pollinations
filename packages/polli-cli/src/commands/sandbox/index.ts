import { Command, InvalidArgumentError } from "commander";
import { requireKey } from "../../lib/api.js";
import {
    fail,
    printResult,
    printSuccess,
    printTable,
} from "../../lib/output.js";
import {
    createSandbox,
    killSandbox,
    LEASE_SECONDS,
    listSandboxes,
    setSandboxTimeout,
} from "./e2b.js";
import { proxy, setupSsh } from "./ssh.js";

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
        new Command("list")
            .description("List your sandboxes")
            .action(async () => {
                requireKey();
                try {
                    const sandboxes = await listSandboxes();
                    printTable(
                        sandboxes.map((s) => ({
                            id: s.sandboxID,
                            state: s.state,
                            template: s.alias ?? s.templateID,
                            size: `${s.cpuCount} vCPU, ${s.memoryMB} MB`,
                            paid_until: new Date(s.endAt).toLocaleString(),
                        })),
                    );
                } catch (err) {
                    fail("Failed to list sandboxes", err);
                }
            }),
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
        new Command("kill")
            .description("Delete a sandbox and its files")
            .argument("<id>")
            .action(async (id: string) => {
                requireKey();
                try {
                    await killSandbox(id);
                    printSuccess(`Sandbox ${id} killed.`);
                } catch (err) {
                    fail(`Failed to kill sandbox ${id}`, err);
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
    );
