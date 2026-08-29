import { homedir } from "node:os";
import { Command } from "commander";
import {
    disableHarness,
    enableHarness,
    harnessStatus,
    installHarness,
    needsInstall,
} from "../harnesses/engine.js";
import { findHarness, HARNESSES } from "../harnesses/index.js";
import { resolveHarnessKey } from "../harnesses/keys.js";
import { fetchHarnessModels } from "../harnesses/models.js";
import type { HarnessContext } from "../harnesses/types.js";
import { fail, printInfo, printResult, printSuccess } from "../lib/output.js";

const context = (): HarnessContext => ({ home: homedir(), env: process.env });

const OFF_MESSAGES = {
    restored: "original config restored.",
    stripped: "Pollinations entries removed.",
    unchanged: "was not connected; nothing changed.",
};

const list = new Command("list")
    .description("List supported coding harnesses and whether they are on")
    .action(() => {
        const ctx = context();
        printResult(
            HARNESSES.map((harness) => {
                const status = harness.status(ctx);
                return {
                    id: harness.id,
                    name: harness.label,
                    status: status.configured ? "on" : "off",
                    model: status.model ?? "-",
                    docs: harness.docsUrl,
                };
            }),
        );
    });

export const harnessCommand = new Command("harness")
    .description("Point a coding harness (DeepSeek Harness, …) at Pollinations")
    .argument("[harness]", "Harness id — see `polli harness list`")
    .argument("[action]", "on | off | status | help", "on")
    .option("--model <id>", "Default model for the harness")
    .option("--no-browser", "Print the login URL instead of opening a browser")
    .addHelpText(
        "after",
        `
Examples:
  polli harness list
  polli harness dsh on                 # install if missing, login, mint a key, write the provider
  polli harness dsh on --model kimi
  polli harness dsh status
  polli harness dsh off                # restore the config saved before "on"

Guide: https://gen.pollinations.ai/docs#tag/coding-harnesses
`,
    )
    .addCommand(list)
    .action(async (id: string | undefined, action: string, opts) => {
        if (!id) return harnessCommand.help();
        const profile = findHarness(id);
        if (!profile) {
            return fail(`Unknown harness "${id}". Run: polli harness list`);
        }
        const ctx = context();

        switch (action) {
            case "help":
                return harnessCommand.help();
            case "status":
                printResult({ ...harnessStatus(profile, ctx) });
                return;
            case "off": {
                const result = { ...disableHarness(profile, ctx) };
                const outcome = result.outcome ?? "unchanged";
                printSuccess(`${profile.label}: ${OFF_MESSAGES[outcome]}`);
                if (outcome !== "unchanged") printInfo(profile.restartHint);
                printResult(result);
                return;
            }
            case "on": {
                const model: string = opts.model ?? profile.defaultModel;
                try {
                    if (needsInstall(profile, ctx)) {
                        printInfo(
                            `${profile.label} is not installed. Running the official installer:\n  ${profile.install?.command}`,
                        );
                        installHarness(profile, ctx);
                    }
                    const apiKey = await resolveHarnessKey(profile, ctx, {
                        browser: opts.browser,
                    });
                    const models = await fetchHarnessModels();
                    if (!models.some((m) => m.id === model)) {
                        return fail(
                            `Model "${model}" is not a tool-calling text model. Run: polli models`,
                        );
                    }
                    const result = {
                        ...enableHarness(profile, ctx, {
                            apiKey,
                            model,
                            models,
                        }),
                    };
                    printSuccess(
                        `${profile.label} now uses Pollinations (model: ${model}).`,
                    );
                    printInfo(profile.restartHint);
                    printResult(result);
                } catch (err) {
                    fail(`Failed to connect ${profile.label}`, err);
                }
                return;
            }
            default:
                return fail(
                    `Unknown action "${action}". Use on, off, status, or help.`,
                );
        }
    });
