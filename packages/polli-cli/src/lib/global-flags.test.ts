import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, expect, it, vi } from "vitest";

import type { configureGlobalFlags as configureType } from "./global-flags.js";

const homes: string[] = [];
afterAll(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true });
});

const freshModules = async (): Promise<{
    config: typeof import("./config.js");
    output: typeof import("./output.js");
    configureGlobalFlags: typeof configureType;
}> => {
    vi.resetModules();
    const home = mkdtempSync(join(tmpdir(), "polli-flags-"));
    homes.push(home);
    process.env.HOME = home;
    process.env.NO_COLOR = undefined;
    const config = await import("./config.js");
    const output = await import("./output.js");
    const { configureGlobalFlags } = await import("./global-flags.js");
    return { config, output, configureGlobalFlags };
};

const buildProgram = (
    configureGlobalFlags: typeof configureType,
): { program: Command; capture: () => string[] | undefined } => {
    let captured: string[] | undefined;
    const program = new Command("polli")
        .option("--json", "Output as JSON")
        .option("--key <key>", "Override stored API key for this command");

    program.addCommand(
        new Command("keys").addCommand(new Command("list").action(() => {})),
    );
    program.addCommand(
        new Command("usage")
            .option(
                "--key <key>",
                "Filter usage by key",
                (value, previous = []) => {
                    return [...(previous as string[]), value];
                },
            )
            .action((opts: { key?: string[] }) => {
                captured = opts.key;
            }),
    );

    configureGlobalFlags(program);
    return { program, capture: () => captured };
};

it("sets JSON output for a root --json before a subcommand", async () => {
    const { config, output, configureGlobalFlags } = await freshModules();
    const { program } = buildProgram(configureGlobalFlags);

    await program.parseAsync(["node", "polli", "--json", "keys", "list"]);

    expect(output.getOutputMode()).toBe("json");
    expect(process.env.NO_COLOR).toBe("1");
    expect(config.resolveApiKey()).toBeUndefined();
});

it("sets JSON output for a --json after a nested subcommand", async () => {
    const { output, configureGlobalFlags } = await freshModules();
    const { program } = buildProgram(configureGlobalFlags);

    await program.parseAsync(["node", "polli", "keys", "list", "--json"]);

    expect(output.getOutputMode()).toBe("json");
    expect(process.env.NO_COLOR).toBe("1");
});

it("applies a trailing --key to a nested keys list", async () => {
    const { config, configureGlobalFlags } = await freshModules();
    const { program } = buildProgram(configureGlobalFlags);

    await program.parseAsync([
        "node",
        "polli",
        "keys",
        "list",
        "--key",
        "token",
    ]);

    expect(config.resolveApiKey()).toBe("token");
});

it("applies a root --key to a nested keys list", async () => {
    const { config, configureGlobalFlags } = await freshModules();
    const { program } = buildProgram(configureGlobalFlags);

    await program.parseAsync([
        "node",
        "polli",
        "--key",
        "rootkey",
        "keys",
        "list",
    ]);

    expect(config.resolveApiKey()).toBe("rootkey");
});

it("keeps root auth separate from the usage --key filter", async () => {
    const { config, configureGlobalFlags } = await freshModules();
    const { program, capture } = buildProgram(configureGlobalFlags);

    await program.parseAsync([
        "node",
        "polli",
        "--key",
        "auth",
        "usage",
        "--key",
        "filter",
    ]);

    expect(config.resolveApiKey()).toBe("auth");
    expect(capture()).toEqual(["filter"]);
});

it("collects repeated usage --key filters immutably", async () => {
    const { config, configureGlobalFlags } = await freshModules();
    const first = buildProgram(configureGlobalFlags);
    const second = buildProgram(configureGlobalFlags);

    await first.program.parseAsync([
        "node",
        "polli",
        "usage",
        "--key",
        "a",
        "--key",
        "b",
    ]);
    expect(first.capture()).toEqual(["a", "b"]);

    await second.program.parseAsync([
        "node",
        "polli",
        "usage",
        "--key",
        "filter",
    ]);
    expect(second.capture()).toEqual(["filter"]);
    expect(config.resolveApiKey()).toBeUndefined();
});
