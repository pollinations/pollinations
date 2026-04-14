import { Command } from "commander";

import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { createGenCommand } from "./commands/gen/index.js";
import { keysCommand } from "./commands/keys.js";
import { mcpCommand } from "./commands/mcp.js";
import { modelsCommand } from "./commands/models.js";
import { usageCommand } from "./commands/usage.js";

import { setKeyOverride } from "./lib/config.js";
import { setOutputMode } from "./lib/output.js";
import { flavor } from "./lib/quotes.js";

const program = new Command();

program
    .name("polli")
    .description(
        "The Pollinations CLI — for humans, AI agents, and everything in between",
    )
    .version(`0.1.0-alpha.1 — ${flavor.version}`)
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

// Discovery
program.addCommand(modelsCommand);
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
