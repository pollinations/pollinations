import { homedir } from "node:os";
import { Command } from "commander";
import { HARNESSES } from "../harnesses/index.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessOnOptions,
} from "../harnesses/types.js";
import {
    fail,
    printError,
    printInfo,
    printResult,
    printSuccess,
} from "../lib/output.js";

const context = (): HarnessContext => ({ home: homedir(), env: process.env });

const OFF_MESSAGES = {
    restored: "original config restored.",
    stripped: "Pollinations entries removed.",
    unchanged: "was not connected; nothing changed.",
};

/** Errors may carry an adapter-chosen exit code (see HarnessResult.exitCode). */
const exitWith = (message: string, error: unknown): never => {
    const code =
        error !== null &&
        typeof error === "object" &&
        "exitCode" in error &&
        typeof (error as { exitCode: unknown }).exitCode === "number"
            ? (error as { exitCode: number }).exitCode
            : undefined;
    if (code === undefined || code === 1) fail(message, error);
    const detail = error instanceof Error ? `: ${error.message}` : "";
    printError(`${message}${detail}`);
    process.exit(code);
};

const adoptExitCode = (result: { exitCode?: number; notes?: string[] }) => {
    for (const note of result.notes ?? []) printInfo(note);
    if (result.exitCode) process.exitCode = result.exitCode;
};

const runOn = async (harness: HarnessAdapter, options: HarnessOnOptions) => {
    try {
        const result = await harness.on(context(), options);
        if (result.exitCode === 3) {
            printInfo(
                `${harness.label}: waiting for manual steps - finish them, then re-run \`polli harness ${harness.id} on\` or check \`polli harness ${harness.id} status\`.`,
            );
        } else {
            const model = result.model ? ` (model: ${result.model})` : "";
            printSuccess(`${harness.label} now uses Pollinations${model}.`);
            printInfo(harness.restartHint);
        }
        printResult(result);
        adoptExitCode(result);
    } catch (error) {
        exitWith(`Failed to connect ${harness.label}`, error);
    }
};

const runOff = async (harness: HarnessAdapter) => {
    try {
        const result = await harness.off(context());
        const outcome = result.outcome ?? "unchanged";
        printSuccess(`${harness.label}: ${OFF_MESSAGES[outcome]}`);
        if (outcome !== "unchanged" && result.exitCode !== 3) {
            printInfo(harness.restartHint);
        }
        printResult(result);
        adoptExitCode(result);
    } catch (error) {
        exitWith(`Failed to disconnect ${harness.label}`, error);
    }
};

const runStatus = async (harness: HarnessAdapter) => {
    try {
        const result = await harness.status(context());
        printResult(result);
        adoptExitCode(result);
    } catch (error) {
        exitWith(`Failed to inspect ${harness.label}`, error);
    }
};

const withOnOptions = (command: Command) =>
    command
        .option("--model <id>", "Default model for the harness")
        .option("--no-mcp", "Skip MCP tool configuration")
        .option(
            "--no-browser",
            "Print the login URL instead of opening a browser",
        )
        .option(
            "--smoke",
            "Send one billable smoke request after setup to prove quota works",
        );

const harnessSubcommand = (harness: HarnessAdapter) => {
    const command = withOnOptions(
        new Command(harness.id).description(harness.description),
    ).action((options: HarnessOnOptions) => runOn(harness, options));

    command.addCommand(
        new Command("on")
            .description(`Connect ${harness.label} to Pollinations`)
            .action(() => runOn(harness, command.opts<HarnessOnOptions>())),
    );
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
