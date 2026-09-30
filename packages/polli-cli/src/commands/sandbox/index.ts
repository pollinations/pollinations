import { Command, InvalidArgumentError } from "commander";
import { requireKey } from "../../lib/api.js";
import {
    fail,
    getOutputMode,
    printInfo,
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
    pauseSandbox,
    type Sandbox,
    sandboxLogs,
    setSandboxTimeout,
} from "./e2b.js";
import { proxy, setupSsh } from "./ssh.js";

// Command names, aliases and options follow E2B's CLI (`e2b sandbox ...`).

// Whole seconds, as in `e2b sandbox create --timeout`.
function parseSeconds(value: string): number {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1) {
        throw new InvalidArgumentError("Give a whole number of seconds.");
    }
    return seconds;
}

// Lowest first: `--level warn` also shows errors.
const LEVELS = ["debug", "info", "warn", "error"];

function parseLevel(value: string): string {
    const level = value.toLowerCase();
    if (!LEVELS.includes(level)) {
        throw new InvalidArgumentError(`Give one of ${LEVELS.join(", ")}.`);
    }
    return level;
}

const time = (secondsFromNow: number) =>
    new Date(Date.now() + secondsFromNow * 1000).toLocaleString();

// A paused sandbox's endAt is when it paused, so only a running one shows it.
const describe = (sandbox: Sandbox) => ({
    id: sandbox.sandboxID,
    template: sandbox.alias ?? sandbox.templateID,
    size: `${sandbox.cpuCount} vCPU, ${sandbox.memoryMB} MB`,
    state:
        sandbox.state === "running"
            ? `running until ${new Date(sandbox.endAt).toLocaleString()}`
            : sandbox.state,
});

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
            .alias("cr")
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
            .alias("ls")
            .description("List your sandboxes")
            .option("-s, --state <state>", "running or paused (default: both)")
            .action(async ({ state }: { state?: string }) => {
                requireKey();
                try {
                    const sandboxes = await listSandboxes(state);
                    if (getOutputMode() === "json") printResult(sandboxes);
                    else printTable(sandboxes.map(describe));
                } catch (err) {
                    fail("Failed to list sandboxes", err);
                }
            }),
    )
    .addCommand(
        new Command("info")
            .alias("in")
            .description("Show a sandbox")
            .argument("<id>")
            .action(async (id: string) => {
                requireKey();
                try {
                    const sandbox = await getSandbox(id);
                    printResult(
                        getOutputMode() === "json"
                            ? sandbox
                            : describe(sandbox),
                    );
                } catch (err) {
                    fail(`Failed to get sandbox ${id}`, err);
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
        new Command("pause")
            .alias("ps")
            .description("Pause a sandbox; its files stay")
            .argument("<id>")
            .action(async (id: string) => {
                requireKey();
                try {
                    await pauseSandbox(id);
                    printSuccess(`Sandbox ${id} paused.`);
                } catch (err) {
                    fail(`Failed to pause sandbox ${id}`, err);
                }
            }),
    )
    .addCommand(
        new Command("resume")
            .alias("rs")
            .description(
                `Resume a sandbox for its paid time, at least ${LEASE_SECONDS / 60} minutes`,
            )
            .argument("<id>")
            .action(async (id: string) => {
                requireKey();
                try {
                    await connectSandbox(id);
                    const { endAt } = await getSandbox(id);
                    printSuccess(
                        `Sandbox ${id} runs until ${new Date(endAt).toLocaleString()}, then pauses.`,
                    );
                } catch (err) {
                    fail(`Failed to resume sandbox ${id}`, err);
                }
            }),
    )
    .addCommand(
        new Command("kill")
            .alias("kl")
            .description("Delete sandboxes and their files")
            .argument("[ids...]")
            .option("-a, --all", "kill all your sandboxes")
            .option(
                "-s, --state <state>",
                "with --all, only running or paused ones",
            )
            .action(
                async (
                    ids: string[],
                    { all, state }: { all?: boolean; state?: string },
                ) => {
                    requireKey();
                    if (!!all === ids.length > 0) {
                        fail("Give sandbox ids, or --all.");
                    }
                    try {
                        const targets = all
                            ? (await listSandboxes(state)).map(
                                  (sandbox) => sandbox.sandboxID,
                              )
                            : ids;
                        if (!targets.length) printInfo("No sandboxes.");
                        for (const id of targets) {
                            await killSandbox(id);
                            printSuccess(`Sandbox ${id} killed.`);
                        }
                    } catch (err) {
                        fail("Failed to kill sandboxes", err);
                    }
                },
            ),
    )
    .addCommand(
        new Command("logs")
            .alias("lg")
            .description("Show a sandbox's system log: start and processes")
            .argument("<id>")
            .option(
                "--level <level>",
                `lowest level shown: ${LEVELS.join(", ")}`,
                parseLevel,
                "info",
            )
            .action(async (id: string, { level }: { level: string }) => {
                requireKey();
                try {
                    const { logEntries } = await sandboxLogs(id);
                    const shown = logEntries.filter(
                        (entry) =>
                            LEVELS.indexOf(entry.level.toLowerCase()) >=
                            LEVELS.indexOf(level),
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
