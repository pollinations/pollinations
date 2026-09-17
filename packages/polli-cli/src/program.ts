import { readFileSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import { agentsCommand } from "./commands/agents.js";
import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { earningsCommand } from "./commands/earnings.js";
import { createGenCommand } from "./commands/gen/index.js";
import { harnessCommand } from "./commands/harness.js";
import { keysCommand } from "./commands/keys.js";
import { modelsCommand } from "./commands/models.js";
import { myModelsCommand } from "./commands/my-models.js";
import { questsCommand } from "./commands/quests.js";
import { updateCommand } from "./commands/update.js";
import { uploadCommand } from "./commands/upload.js";
import { usageCommand } from "./commands/usage.js";
import { configureGlobalFlags } from "./lib/global-flags.js";
import { flavor } from "./lib/quotes.js";
import { notifyUpdate } from "./lib/update-notice.js";

const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { name: string; version: string };

export const program = new Command();
program.configureHelp({
    styleTitle: (s) => chalk.hex("#a78bfa").bold(s),
    styleCommandText: (s) => chalk.bold(s),
    styleSubcommandText: (s) => chalk.bold(s),
    styleOptionText: (s) => chalk.cyan(s),
    styleArgumentText: (s) => chalk.yellow(s),
    styleDescriptionText: (s) => chalk.dim(s),
});
program
    .name("polli")
    .description(
        "The Pollinations CLI — for humans, AI agents, and everything in between",
    )
    .version(`${pkg.version} — ${flavor.version}`)
    .option("--json", "Output as JSON")
    .option("--key <key>", "Override stored API key for this command")
    .addHelpText(
        "after",
        chalk.dim(
            "\nAI agent? Read the skill file for the full usage map:\n  https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md\n",
        ),
    )
    .hook("postAction", (_command, action) => {
        if (action.name() !== "update") return notifyUpdate(pkg);
    });

for (const command of [
    authCommand,
    keysCommand,
    usageCommand,
    earningsCommand,
    questsCommand,
    agentsCommand,
    myModelsCommand,
    harnessCommand,
    createGenCommand(),
    uploadCommand,
    modelsCommand,
    docsCommand,
    updateCommand,
]) {
    program.addCommand(command);
}

configureGlobalFlags(program);
