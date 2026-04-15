import { readFileSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";

import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { createGenCommand } from "./commands/gen/index.js";
import { keysCommand } from "./commands/keys.js";
import { modelsCommand } from "./commands/models.js";
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
    .option("--key <key>", "Override stored API key for this command")
    .hook("preAction", () => {
        const opts = program.opts();

        if (opts.json) {
            setOutputMode("json");
            process.env.NO_COLOR = "1";
        }

        if (opts.key) {
            setKeyOverride(opts.key);
        }
    });

// Auth & account
program.addCommand(authCommand);
program.addCommand(keysCommand);
program.addCommand(usageCommand);

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
