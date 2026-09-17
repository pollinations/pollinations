import type { Command } from "commander";
import { setKeyOverride } from "./config.js";
import { setOutputMode } from "./output.js";

export const configureGlobalFlags = (program: Command): void => {
    program.enablePositionalOptions();

    for (const command of program.commands) {
        if (
            !command.options.some((option) => option.attributeName() === "json")
        ) {
            command.option("--json", "Output as JSON");
        }
        if (
            command.name() !== "usage" &&
            !command.options.some((option) => option.attributeName() === "key")
        ) {
            command.option(
                "--key <key>",
                "Override stored API key for this command",
            );
        }
    }

    program.hook("preAction", (_thisCommand, actionCommand) => {
        let child = actionCommand;
        while (child.parent && child.parent !== program) child = child.parent;

        const rootOpts = program.opts();
        const childOpts = child.opts();

        if (rootOpts.json || childOpts.json) {
            setOutputMode("json");
            process.env.NO_COLOR = "1";
        }

        const key =
            child.name() === "usage"
                ? rootOpts.key
                : (childOpts.key ?? rootOpts.key);
        if (typeof key === "string") setKeyOverride(key);
    });
};
