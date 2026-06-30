import { readFileSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { createGenCommand } from "./commands/gen/index.js";
import { keysCommand } from "./commands/keys.js";
import { modelsCommand } from "./commands/models.js";
import { myModelsCommand } from "./commands/my-models.js";
import { questsCommand } from "./commands/quests.js";
import { uploadCommand } from "./commands/upload.js";
import { usageCommand } from "./commands/usage.js";
import { configCommand } from "./commands/config.js";
import { mcpCommand } from "./commands/mcp.js";
import { setKeyOverride } from "./lib/config.js";
import { setOutputMode, setQuietMode, setVerboseMode, getOutputMode } from "./lib/output.js";
import { initI18n, t } from "./lib/i18n.js";
import { flavor } from "./lib/quotes.js";
import { initLogger, logActivity } from "./lib/logger.js";
import { initSecureStorage } from "./lib/secure-storage.js";

const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

// Initialize i18n, logger, secure storage
await initI18n();
await initLogger();
await initSecureStorage();

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
    .description(t("cli.description"))
    .version(`${pkg.version} — ${flavor.version}`)
    .option("--json", t("cli.option.json"))
    .option("--yaml", "Output as YAML")
    .option("--csv", "Output as CSV")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show verbose debug output")
    .option("--key <key>", t("cli.option.key"))
    .addHelpText(
        "after",
        chalk.dim(
            `\nAI agent? Read the skill file for the full usage map:\n  https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md\n`,
        ),
    )
    .hook("preAction", (command) => {
        const opts = command.opts();
        if (opts.json) setOutputMode("json");
        else if (opts.yaml) setOutputMode("yaml");
        else if (opts.csv) setOutputMode("csv");
        else setOutputMode("human");
        if (opts.quiet) setQuietMode(true);
        if (opts.verbose) setVerboseMode(true);
        if (opts.key) setKeyOverride(opts.key);
        // Log the command
        const args = process.argv.slice(2).join(" ");
        logActivity("command", { args, mode: getOutputMode() });
    });

program.addCommand(authCommand);
program.addCommand(keysCommand);
program.addCommand(usageCommand);
program.addCommand(createGenCommand());
program.addCommand(uploadCommand);
program.addCommand(modelsCommand);
program.addCommand(docsCommand);
program.addCommand(configCommand);
program.addCommand(mcpCommand);

if (process.argv.length <= 2) {
    program.help();
}

program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});