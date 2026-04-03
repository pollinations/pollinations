import { Command } from "commander";
import { appsCommand } from "./commands/apps.js";
import { audioCommand } from "./commands/audio.js";
import { authCommand } from "./commands/auth.js";
import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config.js";
import { deployCommand } from "./commands/deploy.js";
import { editCommand } from "./commands/edit.js";
import { healthCommand } from "./commands/health.js";
import { imageCommand } from "./commands/image.js";
import { keysCommand } from "./commands/keys.js";
import { mcpCommand } from "./commands/mcp.js";
import { modelsCommand } from "./commands/models.js";
import { pipeCommand } from "./commands/pipe.js";
import { textCommand } from "./commands/text.js";
import { tierCommand } from "./commands/tier.js";
import { transcribeCommand } from "./commands/transcribe.js";
import { pollenCommand, usageCommand } from "./commands/usage.js";
import { videoCommand } from "./commands/video.js";
import { whoamiCommand } from "./commands/whoami.js";
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
    .option("--yes", "Skip all interactive confirmations")
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

// Auth & identity
program.addCommand(authCommand);
program.addCommand(whoamiCommand);

// Keys & account
program.addCommand(keysCommand);
program.addCommand(usageCommand);
program.addCommand(pollenCommand);
program.addCommand(modelsCommand);
program.addCommand(tierCommand);

// Generation — top-level for dead-simple usage
program.addCommand(textCommand);
program.addCommand(imageCommand);
program.addCommand(editCommand);
program.addCommand(audioCommand);
program.addCommand(videoCommand);
program.addCommand(chatCommand);
program.addCommand(pipeCommand);
program.addCommand(transcribeCommand);

// Config & diagnostics
program.addCommand(configCommand);
program.addCommand(healthCommand);

// Apps & deploy
program.addCommand(appsCommand);
program.addCommand(deployCommand);

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
