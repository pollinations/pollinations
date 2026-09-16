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
import { uploadCommand } from "./commands/upload.js";
import { usageCommand } from "./commands/usage.js";

import { setKeyOverride } from "./lib/config.js";
import { setOutputMode } from "./lib/output.js";
import { flavor } from "./lib/quotes.js";

const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

const program = new Command();

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
    .option(
        "--key <key>",
        "Override stored API key for this command",
        // Commander shares the option store between the program and its
        // subcommands, so this accumulates every --key value; preAction
        // picks the one that precedes the command name as the auth
        // override — later values are that command's own --key filters.
        (value, previous: string[] = []) => [...previous, value],
    )
    .addHelpText(
        "after",
        chalk.dim(
            `\nAI agent? Read the skill file for the full usage map:\n  https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md\n`,
        ),
    )
    .hook("preAction", (_command, actionCommand) => {
        const opts = program.opts();

        if (opts.json) {
            setOutputMode("json");
            process.env.NO_COLOR = "1";
        }

        // A --key that appears BEFORE the action command name authenticates
        // the request; a later --key belongs to that command's own filters
        // (e.g. the usage key filter) and must not become credentials.
        const argv = process.argv;
        const nameIdx = argv.indexOf(actionCommand.name());
        for (let i = 0; i < nameIdx; i++) {
            if (argv[i] === "--key") {
                setKeyOverride(argv[i + 1] ?? "");
                break;
            }
            if (argv[i]?.startsWith("--key=")) {
                setKeyOverride(argv[i].slice("--key=".length));
                break;
            }
        }
    });

// Auth & account
program.addCommand(authCommand);
program.addCommand(keysCommand);
program.addCommand(usageCommand);
program.addCommand(earningsCommand);
program.addCommand(questsCommand);
program.addCommand(agentsCommand);
program.addCommand(myModelsCommand);

// Coding harness integrations
program.addCommand(harnessCommand);

// Generation
program.addCommand(createGenCommand());
program.addCommand(uploadCommand);

// Discovery
program.addCommand(modelsCommand);
program.addCommand(docsCommand);

// Show help when run with no args
if (process.argv.length <= 2) {
    program.help();
}

program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});
