import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureHelp, printTable, setOutputMode } from "./output.js";

const originalLevel = chalk.level;
afterEach(() => {
    chalk.level = originalLevel;
    vi.restoreAllMocks();
    setOutputMode("human");
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

describe("printTable", () => {
    it("prints a large table without exceeding the function argument limit", () => {
        chalk.level = 0;
        setOutputMode("human");
        const write = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        const rows = Array.from({ length: 200_000 }, (_, index) => ({
            index,
            value: "row",
        }));

        expect(() => printTable(rows)).not.toThrow();

        expect(write).toHaveBeenCalledWith("index   value\n");
        expect(write).toHaveBeenCalledWith("0       row\n");
        expect(write).toHaveBeenCalledWith("199999  row\n");
    });
});
