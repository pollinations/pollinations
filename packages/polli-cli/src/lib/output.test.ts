import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { configureHelp, formatDollars } from "./output.js";

describe("formatDollars", () => {
    it.each([
        [0, "$0.00"],
        [5, "$5.00"],
        [-0.3, "-$0.30"],
        [0.019, "$0.02"],
        [0.004, "$0.004"],
        [0.0000000001, "$0.0000000001"],
        [-0.0004, "-$0.0004"],
    ])("formats %d as %s", (amount, expected) => {
        expect(formatDollars(amount)).toBe(expected);
    });

    // A nonzero amount smaller than the display can round to must not lose
    // every digit: stripping trailing zeros returned a dangling "$0.".
    it.each([
        [1e-11, "<$0.0000000001"],
        [-1e-11, ">-$0.0000000001"],
        [4.9e-11, "<$0.0000000001"],
        [-4.9e-11, ">-$0.0000000001"],
        // Float residue from an arithmetic balance can land here too.
        [0.1 + 0.2 - 0.3, "<$0.0000000001"],
    ])("bounds sub-resolution %d as %s", (amount, expected) => {
        expect(formatDollars(amount)).toBe(expected);
    });

    it.each([
        [5.1e-11, "$0.0000000001"],
        [-5.1e-11, "-$0.0000000001"],
    ])(
        "rounds %d just above the display threshold to %s",
        (amount, expected) => {
            expect(formatDollars(amount)).toBe(expected);
        },
    );
});

const originalLevel = chalk.level;
afterEach(() => {
    chalk.level = originalLevel;
});

describe("configureHelp", () => {
    it.each([0, 3] as const)(
        "styles every depth at color level %i",
        (level) => {
            chalk.level = level;
            const root = new Command("polli");
            const harness = new Command("harness");
            const pi = new Command("pi").option(
                "--model <id>",
                "Default model",
            );
            const models = new Command("models");
            root.addCommand(harness.addCommand(pi)).addCommand(models);
            const commands = [root, harness, pi, models];
            for (const command of commands) {
                command.configureOutput({ getOutHasColors: () => level > 0 });
            }
            const plainHelp = commands.map((command) =>
                command.helpInformation(),
            );

            configureHelp(root);

            for (const [i, command] of commands.entries()) {
                const help = command.helpInformation();
                expect(help).toContain(chalk.hex("#a78bfa").bold("Usage:"));
                expect(help).toContain(chalk.cyan("-h, --help"));
                expect(stripVTControlCharacters(help)).toBe(plainHelp[i]);
                if (level === 0) expect(help).toBe(plainHelp[i]);
            }
            expect(pi.helpInformation()).toContain(chalk.cyan("--model <id>"));
        },
    );
});
