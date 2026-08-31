import { homedir } from "node:os";
import { Command } from "commander";
import { HARNESSES } from "../harnesses/index.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessOnOptions,
} from "../harnesses/types.js";
import { fail, printInfo, printResult, printSuccess } from "../lib/output.js";

const context = (): HarnessContext => ({ home: homedir(), env: process.env });

const OFF_MESSAGES = {
    restored: "original config restored.",
    stripped: "Pollinations entries removed.",
    unchanged: "was not connected; nothing changed.",
};

export const runOn = async (
    harness: HarnessAdapter,
    options: HarnessOnOptions,
) => {
    try {
        const result = await harness.on(context(), options);
        if (!result.configured) {
            printInfo(
                `${harness.label} is not ready; run its status command for details.`,
            );
            printResult(result);
            return;
        }
        const model = result.model ? ` (model: ${result.model})` : "";
        printSuccess(`${harness.label} now uses Pollinations${model}.`);
        printInfo(harness.restartHint);
        printResult(result);
    } catch (error) {
        fail(`Failed to connect ${harness.label}`, error);
    }
};

const runOff = async (harness: HarnessAdapter) => {
    try {
        const result = await harness.off(context());
        const outcome = result.outcome ?? "unchanged";
        printSuccess(`${harness.label}: ${OFF_MESSAGES[outcome]}`);
        if (outcome !== "unchanged") printInfo(harness.restartHint);
        printResult(result);
    } catch (error) {
        fail(`Failed to disconnect ${harness.label}`, error);
    }
};

const runStatus = async (harness: HarnessAdapter) => {
    try {
        printResult(await harness.status(context()));
    } catch (error) {
        fail(`Failed to inspect ${harness.label}`, error);
    }
};

const withOnOptions = (command: Command, supportsMcp: boolean) => {
    command
        .option("--model <id>", "Default model for the harness")
        .option(
            "--no-browser",
            "Print the login URL instead of opening a browser",
        );
    if (supportsMcp) command.option("--no-mcp", "Skip MCP tool configuration");
    return command;
};

export const mergeOnOptions = (
    parent: Command,
    child: Command,
): HarnessOnOptions => {
    const keys = new Set([
        ...Object.keys(parent.opts()),
        ...Object.keys(child.opts()),
    ]);
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
        const childSource = child.getOptionValueSource(key);
        const parentSource = parent.getOptionValueSource(key);
        // Explicit child flags win, then explicit parent flags; Commander’s
        // defaults fill the remaining gaps without masking either flag.
        const childIsExplicit =
            childSource !== undefined && childSource !== "default";
        const parentIsExplicit =
            parentSource !== undefined && parentSource !== "default";
        let value: unknown;
        if (childIsExplicit) value = child.opts()[key];
        else if (parentIsExplicit) value = parent.opts()[key];
        else if (childSource === "default") value = child.opts()[key];
        else value = parent.opts()[key];
        if (value !== undefined) merged[key] = value;
    }
    return merged as HarnessOnOptions;
};

const harnessSubcommand = (harness: HarnessAdapter) => {
    const command = withOnOptions(
        new Command(harness.id).description(harness.description),
        harness.supportsMcp === true,
    ).action((options: HarnessOnOptions) => runOn(harness, options));

    const onCommand = withOnOptions(
        new Command("on").description(
            `Connect ${harness.label} to Pollinations`,
        ),
        harness.supportsMcp === true,
    );
    onCommand.action((_: HarnessOnOptions, actionCommand: Command) =>
        runOn(harness, mergeOnOptions(command, actionCommand)),
    );
    command.addCommand(onCommand);
    command.addCommand(
        new Command("off")
            .description(`Restore ${harness.label}'s previous configuration`)
            .action(() => runOff(harness)),
    );
    command.addCommand(
        new Command("status")
            .description(`Show ${harness.label}'s Pollinations status`)
            .action(() => runStatus(harness)),
    );
    return command;
};

export const harnessCommand = new Command("harness")
    .description("Configure coding harnesses to use Pollinations")
    .addHelpText(
        "after",
        "\nGuide: https://gen.pollinations.ai/docs#tag/coding-harnesses\n",
    );

for (const harness of HARNESSES) {
    harnessCommand.addCommand(harnessSubcommand(harness));
}
