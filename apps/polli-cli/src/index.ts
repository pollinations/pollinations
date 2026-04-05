import { Command } from "commander";

import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { createGenCommand } from "./commands/gen/index.js";
import { healthCommand } from "./commands/health.js";
import { keysCommand } from "./commands/keys.js";
import { mcpCommand } from "./commands/mcp.js";
import { modelsCommand } from "./commands/models.js";
import { statsCommand } from "./commands/stats.js";
import { pollenCommand, usageCommand } from "./commands/usage.js";

import { setKeyOverride } from "./lib/config.js";
import { setOutputMode } from "./lib/output.js";

const program = new Command();

program
    .name("polli")
    .description(
        "The Pollinations CLI — for humans, AI agents, and everything in between",
    )
    .version("0.1.0")
    .option("--json", "Output as JSON (stdout), messages to stderr")
    .option("--quiet", "Bare values only, no decoration")
    .option("--key <key>", "Override stored API key for this command")
    .hook("preAction", () => {
        const opts = program.opts();

        if (opts.json) {
            setOutputMode("json");
        } else if (opts.quiet) {
            setOutputMode("quiet");
        }

        if (opts.key) {
            setKeyOverride(opts.key);
        }

        if (opts.json || opts.quiet) {
            process.env.NO_COLOR = "1";
        }
    });

// Auth & account
program.addCommand(authCommand);
program.addCommand(keysCommand);
program.addCommand(usageCommand);
program.addCommand(pollenCommand);

// Generation
program.addCommand(createGenCommand());

// Discovery & diagnostics
program.addCommand(modelsCommand);
program.addCommand(healthCommand);
program.addCommand(statsCommand);
program.addCommand(docsCommand);

// MCP
program.addCommand(mcpCommand);

// Show help when run with no args
if (process.argv.length <= 2) {
    program.help();
}

program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});
