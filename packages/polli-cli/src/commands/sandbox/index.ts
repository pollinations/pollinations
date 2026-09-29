import { Command } from "commander";
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
} from "./e2b.js";
import { proxy, setupSsh } from "./ssh.js";

export const sandboxCommand = new Command("sandbox")
    .description("E2B sandboxes billed to your Pollinations account")
    .addCommand(
        new Command("create")
            .description("Start a sandbox you can ssh into")
            .option("-t, --template <name>", "E2B template", "base")
            .action(async ({ template }: { template: string }) => {
                requireKey();
                try {
                    const { sandboxID } = await createSandbox(template);
                    setupSsh();
                    printSuccess(
                        `Sandbox ${sandboxID} created. It pauses about ${LEASE_SECONDS / 60} minutes after the last ssh session.`,
                    );
                    printResult({
                        id: sandboxID,
                        ssh: `ssh ${sandboxID}.polli`,
                    });
                } catch (err) {
                    fail("Failed to create sandbox", err);
                }
            }),
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
