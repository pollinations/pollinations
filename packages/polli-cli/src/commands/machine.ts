import { Command } from "commander";
import { gen, genText, requireKey } from "../lib/api.js";
import {
    fail,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

interface Machine {
    name: string;
    state: string;
    ready: boolean;
    error: string | null;
    image: string;
    cpus: number;
    memoryMb: number;
    diskGb: number;
    autoStopSeconds: number | null;
    createdAt: string;
}

interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/** `KEY=value` pairs from repeated `--env` flags. */
export const parseEnv = (pairs: string[]): Record<string, string> => {
    const env: Record<string, string> = {};
    for (const pair of pairs) {
        const at = pair.indexOf("=");
        if (at < 1) throw new Error(`Expected KEY=value, got "${pair}"`);
        env[pair.slice(0, at)] = pair.slice(at + 1);
    }
    return env;
};

const path = (name: string, rest = "") =>
    `/machines/${encodeURIComponent(name)}${rest}`;

const create = new Command("create")
    .description("Create and start a persistent machine")
    .argument("<name>", "Machine name (lowercase letters, digits, dashes)")
    .requiredOption("--image <ref>", "OCI image, e.g. node:22-bookworm-slim")
    .option(
        "--command <shell>",
        "Long-running process, run with `sh -c` on every start",
    )
    .option(
        "--env <KEY=value>",
        "Environment variable (repeatable)",
        (pair: string, all: string[]) => [...all, pair],
        [] as string[],
    )
    .option(
        "--mint-key",
        "Create a dedicated API key and pass it as POLLINATIONS_API_KEY",
    )
    .option("--cpus <n>", "vCPUs (1-4)", Number)
    .option("--memory <mb>", "Memory in MB", Number)
    .option("--disk <gb>", "Disk in GB", Number)
    .option("--auto-stop <seconds>", "Stop after this long idle", Number)
    .action(async (name: string, opts) => {
        const apiKey = requireKey();
        try {
            const env = parseEnv(opts.env);
            if (opts.mintKey) {
                const minted = await gen<{ key: string }>("/account/keys", {
                    method: "POST",
                    apiKey,
                    body: { name: `polli-machine-${name}`, type: "secret" },
                });
                env.POLLINATIONS_API_KEY = minted.key;
                printSuccess(`Created API key "polli-machine-${name}".`);
            }
            const machine = await gen<Machine>("/machines", {
                method: "POST",
                apiKey,
                body: {
                    name,
                    image: opts.image,
                    ...(opts.command && {
                        command: ["sh", "-c", opts.command],
                    }),
                    ...(Object.keys(env).length && { env }),
                    cpus: opts.cpus,
                    memoryMb: opts.memory,
                    diskGb: opts.disk,
                    autoStopSeconds: opts.autoStop,
                },
            });
            printResult({ ...machine });
        } catch (err) {
            fail("Failed to create machine", err);
        }
    });

const list = new Command("list")
    .alias("ls")
    .description("List your machines")
    .action(async () => {
        try {
            const res = await gen<{ data: Machine[] }>("/machines", {
                apiKey: requireKey(),
            });
            if (!res.data.length) {
                printInfo("No machines.");
                return;
            }
            printTable(
                res.data.map((m) => ({
                    name: m.name,
                    state: m.state,
                    image: m.image,
                    size: `${m.cpus} cpu / ${m.memoryMb} MB / ${m.diskGb} GB`,
                    created: m.createdAt.slice(0, 10),
                })),
                ["name", "state", "image", "size", "created"],
            );
        } catch (err) {
            fail("Failed to list machines", err);
        }
    });

const exec = new Command("exec")
    .description("Run a command inside a machine")
    .argument("<name>")
    .argument("<command...>", "Command and arguments (put them after --)")
    .action(async (name: string, command: string[]) => {
        try {
            const result = await gen<ExecResult>(path(name, "/exec"), {
                method: "POST",
                apiKey: requireKey(),
                body: { command },
            });
            process.stdout.write(result.stdout);
            process.stderr.write(result.stderr);
            process.exitCode = result.exitCode;
        } catch (err) {
            fail("Failed to run command", err);
        }
    });

const logs = new Command("logs")
    .description("Print a machine's boot and process logs")
    .argument("<name>")
    .action(async (name: string) => {
        try {
            process.stdout.write(
                await genText(path(name, "/logs"), { apiKey: requireKey() }),
            );
        } catch (err) {
            fail("Failed to read logs", err);
        }
    });

const simple = (
    verb: string,
    description: string,
    method: string,
    rest: string,
) =>
    new Command(verb)
        .description(description)
        .argument("<name>")
        .action(async (name: string) => {
            try {
                printResult(
                    await gen<Record<string, unknown>>(path(name, rest), {
                        method,
                        apiKey: requireKey(),
                    }),
                );
            } catch (err) {
                fail(`Failed to ${verb} machine`, err);
            }
        });

export const machineCommand = new Command("machine")
    .description("Host long-running agents on persistent machines (preview)")
    .addCommand(create)
    .addCommand(list)
    .addCommand(simple("get", "Show a machine", "GET", ""))
    .addCommand(exec)
    .addCommand(logs)
    .addCommand(simple("start", "Boot a stopped machine", "POST", "/start"))
    .addCommand(
        simple(
            "stop",
            "Power off a machine, keeping its disk",
            "POST",
            "/stop",
        ),
    )
    .addCommand(simple("rm", "Delete a machine and its disk", "DELETE", ""));
