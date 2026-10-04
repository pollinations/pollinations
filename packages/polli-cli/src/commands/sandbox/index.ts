import { Command, InvalidArgumentError } from "commander";
import { requireKey } from "../../lib/api.js";
import {
    fail,
    getOutputMode,
    printResult,
    printSuccess,
    printTable,
} from "../../lib/output.js";
import {
    connectSandbox,
    createSandbox,
    getSandbox,
    killSandbox,
    LEASE_SECONDS,
    type LogEntry,
    listSandboxes,
    sandboxLogs,
} from "./e2b.js";
import { proxy, setupSsh } from "./ssh.js";

// Whole seconds, as in E2B's `timeout`.
function parseSeconds(value: string): number {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1) {
        throw new InvalidArgumentError("Give a whole number of seconds.");
    }
    return seconds;
}

// E2B's tracing fields mean nothing to a user.
const TRACE_FIELDS = ["edge_trace_id", "trace_id", "span_id", "source_type"];

// One line per entry: values with spaces or newlines, such as a process's
// command, are quoted.
const logLine = (entry: LogEntry) =>
    [
        new Date(entry.timestamp).toLocaleString(),
        entry.level.toUpperCase(),
        entry.message,
        ...Object.entries(entry.fields)
            .filter(([key]) => !TRACE_FIELDS.includes(key))
            .map(
                ([key, value]) =>
                    `${key}=${/\s/.test(value) ? JSON.stringify(value) : value}`,
            ),
    ].join(" ");

export const sandboxCommand = new Command("sandbox")
    .description("E2B sandboxes billed to your Pollinations account (alpha)")
    .addCommand(
        new Command("create")
            .description("Start a sandbox you can ssh into")
            .argument("[template]", "E2B template", "pollinations")
            .action(async (template: string) => {
                requireKey();
                try {
                    const { sandboxID } = await createSandbox(template);
                    setupSsh();
                    printSuccess(
                        `Sandbox ${sandboxID} created. It pauses after ${LEASE_SECONDS / 60} minutes without an ssh session.`,
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
                    if (getOutputMode() === "json") {
                        printResult(sandboxes);
                        return;
                    }
                    printTable(
                        // A paused sandbox's endAt is when it paused.
                        sandboxes.map((sandbox) => ({
                            id: sandbox.sandboxID,
                            template: sandbox.alias ?? sandbox.templateID,
                            size: `${sandbox.cpuCount} vCPU, ${sandbox.memoryMB} MB`,
                            state:
                                sandbox.state === "running"
                                    ? `running until ${new Date(sandbox.endAt).toLocaleString()}`
                                    : sandbox.state,
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
                "Keep a sandbox running at least <seconds> from now, paid in advance; resumes a paused one",
            )
            .argument("<id>")
            .argument("<seconds>", "seconds from now", parseSeconds)
            .action(async (id: string, seconds: number) => {
                requireKey();
                try {
                    await connectSandbox(id, seconds);
                    const { endAt } = await getSandbox(id);
                    printSuccess(
                        `Sandbox ${id} runs until ${new Date(endAt).toLocaleString()}, then pauses.`,
                    );
                } catch (err) {
                    fail(`Failed to set the timeout of sandbox ${id}`, err);
                }
            }),
    )
    .addCommand(
        new Command("logs")
            .description("Show a sandbox's system log: start and processes")
            .argument("<id>")
            .action(async (id: string) => {
                requireKey();
                try {
                    const { logEntries } = await sandboxLogs(id);
                    // Debug entries are E2B's internals.
                    const shown = logEntries.filter(
                        (entry) => entry.level !== "debug",
                    );
                    if (getOutputMode() === "json") {
                        printResult(shown);
                        return;
                    }
                    for (const entry of shown) {
                        process.stdout.write(`${logLine(entry)}\n`);
                    }
                } catch (err) {
                    fail(`Failed to get the logs of sandbox ${id}`, err);
                }
            }),
    )
    .addCommand(
        new Command("kill")
            .description("Delete sandboxes and their files")
            .argument("<ids...>")
            .action(async (ids: string[]) => {
                requireKey();
                try {
                    for (const id of ids) {
                        await killSandbox(id);
                        printSuccess(`Sandbox ${id} killed.`);
                    }
                } catch (err) {
                    fail("Failed to kill sandboxes", err);
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
        "\nConnect with `ssh <id>.polli`, or run one command with `ssh <id>.polli <command>`.",
    );
