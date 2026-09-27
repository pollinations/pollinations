import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { configureHelp } from "./output.js";

const originalLevel = chalk.level;
afterEach(() => {
    chalk.level = originalLevel;
});

describe("configureHelp", () => {
    it.each([
        0, 3,
    ] as const)("styles every depth at color level %i", (level) => {
        chalk.level = level;
        const root = new Command("polli");
        const harness = new Command("harness");
        const pi = new Command("pi").option("--model <id>", "Default model");
        const models = new Command("models");
        root.addCommand(harness.addCommand(pi)).addCommand(models);
        const commands = [root, harness, pi, models];
        for (const command of commands) {
            command.configureOutput({ getOutHasColors: () => level > 0 });
        }
        const plainHelp = commands.map((command) => command.helpInformation());

        configureHelp(root);

        for (const [i, command] of commands.entries()) {
            const help = command.helpInformation();
            expect(help).toContain(chalk.hex("#a78bfa").bold("Usage:"));
            expect(help).toContain(chalk.cyan("-h, --help"));
            expect(stripVTControlCharacters(help)).toBe(plainHelp[i]);
            if (level === 0) expect(help).toBe(plainHelp[i]);
        }
        expect(pi.helpInformation()).toContain(chalk.cyan("--model <id>"));
    });
});
