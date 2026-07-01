import { Command } from "commander";
import {
    loadConfig,
    saveConfig,
    getConfigKey,
    setConfigKey,
    removeConfigKey,
    clearConfig,
    getLocale,
} from "../lib/config-store.js";
import {
    printResult,
    printSuccess,
    printError,
    printInfo,
    getOutputMode,
} from "../lib/output.js";
import { t } from "../lib/i18n.js";
import { setLocale } from "../lib/i18n.js";
import { logActivity } from "../lib/logger.js";

const configCommand = new Command("config")
    .description("Manage persistent configuration settings")
    .addHelpText("after", `
Configuration keys:
  defaults.model.text       - Default text model
  defaults.model.image      - Default image model
  defaults.model.audio      - Default audio model
  defaults.model.video      - Default video model
  defaults.width            - Default image width
  defaults.height           - Default image height
  defaults.voice            - Default TTS voice
  defaults.format           - Default audio format
  defaults.outputDir        - Default output directory
  preferences.locale        - Language locale (en, es, etc.)
  preferences.quiet         - Quiet mode (true/false)
  preferences.verbose       - Verbose mode (true/false)
  cache.modelsTTL           - Model cache TTL in seconds

Examples:
  polli config set defaults.model.image flux
  polli config get defaults.width
  polli config list
  polli config remove defaults.voice
  polli config clear
    `);

const listCmd = new Command("list")
    .description("List all configuration values")
    .action(() => {
        const config = loadConfig();
        if (getOutputMode() === "json") {
            printResult(config);
        } else {
            printInfo(t("config.loaded"));
            for (const [key, value] of Object.entries(config)) {
                if (typeof value === "object" && value !== null) {
                    process.stdout.write(`${chalk.bold(key)}:\n`);
                    for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
                        process.stdout.write(`  ${subKey}: ${JSON.stringify(subValue)}\n`);
                    }
                } else {
                    process.stdout.write(`${chalk.bold(key)}: ${JSON.stringify(value)}\n`);
                }
            }
        }
        logActivity("config_list", {});
    });

const getCmd = new Command("get")
    .description("Get a configuration value")
    .argument("<key>", "Configuration key (dot-separated)")
    .action((key) => {
        const value = getConfigKey(key);
        if (value === undefined) {
            printError(`Configuration key "${key}" not found`);
            process.exit(1);
        }
        if (getOutputMode() === "json") {
            printResult({ [key]: value });
        } else {
            printInfo(t("config.key", { key, value: JSON.stringify(value) }));
        }
    });

const setCmd = new Command("set")
    .description("Set a configuration value")
    .argument("<key>", "Configuration key (dot-separated)")
    .argument("<value>", "Value (JSON or string)")
    .action((key, value) => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(value);
        } catch {
            parsed = value;
        }
        setConfigKey(key, parsed);
        // Handle special keys
        if (key === "preferences.locale") {
            setLocale(String(parsed));
        }
        if (getOutputMode() === "json") {
            printResult({ [key]: parsed });
        } else {
            printSuccess(t("config.saved", { path: "~/.pollinations/config.json" }));
            printInfo(t("config.key", { key, value: JSON.stringify(parsed) }));
        }
        logActivity("config_set", { key, value: parsed });
    });

const removeCmd = new Command("remove")
    .description("Remove a configuration key")
    .argument("<key>", "Configuration key (dot-separated)")
    .action((key) => {
        const removed = removeConfigKey(key);
        if (!removed) {
            printError(`Configuration key "${key}" not found`);
            process.exit(1);
        }
        if (getOutputMode() === "json") {
            printResult({ removed: key });
        } else {
            printSuccess(t("config.removed"));
        }
        logActivity("config_remove", { key });
    });

const clearCmd = new Command("clear")
    .description("Clear all configuration")
    .action(() => {
        clearConfig();
        if (getOutputMode() === "json") {
            printResult({ cleared: true });
        } else {
            printSuccess("Configuration cleared.");
        }
        logActivity("config_clear", {});
    });

configCommand.addCommand(listCmd);
configCommand.addCommand(getCmd);
configCommand.addCommand(setCmd);
configCommand.addCommand(removeCmd);
configCommand.addCommand(clearCmd);

export { configCommand };

// For type checking
import chalk from "chalk";