import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { HarnessAdapter } from "../harnesses/types.js";
import { mergeOnOptions, runOn } from "./harness.js";

const output = vi.hoisted(() => ({
    fail: vi.fn(),
    printInfo: vi.fn(),
    printResult: vi.fn(),
    printSuccess: vi.fn(),
}));

vi.mock("../lib/output.js", () => output);

const optionsCommand = () =>
    new Command()
        .option("--model <id>")
        .option("--no-browser")
        .option("--no-mcp");

describe("harness command options", () => {
    it("prefers explicit child values over explicit parent values", () => {
        const parent = optionsCommand();
        parent.setOptionValueWithSource("model", "parent", "cli");
        parent.setOptionValueWithSource("browser", false, "cli");
        const child = optionsCommand();
        child.setOptionValueWithSource("model", "child", "cli");
        child.setOptionValueWithSource("browser", true, "cli");

        expect(mergeOnOptions(parent, child)).toMatchObject({
            model: "child",
            browser: true,
        });
    });

    it("keeps an explicit parent value when the child only has defaults", () => {
        const parent = optionsCommand();
        parent.setOptionValueWithSource("browser", false, "cli");
        const child = optionsCommand();

        expect(mergeOnOptions(parent, child)).toMatchObject({ browser: false });
    });

    it("preserves an explicit child --no-mcp value over defaults", () => {
        const parent = optionsCommand();
        const child = optionsCommand();
        child.setOptionValueWithSource("mcp", false, "cli");

        expect(mergeOnOptions(parent, child)).toMatchObject({ mcp: false });
    });
});

describe("runOn", () => {
    it("does not claim DSH connected when the adapter reports configured=false", async () => {
        const harness: HarnessAdapter = {
            id: "dsh",
            label: "DeepSeek Harness",
            description: "test",
            restartHint: "restart",
            on: vi.fn(async () => ({
                harness: "dsh",
                label: "DeepSeek Harness",
                configured: false,
                files: [],
            })),
            off: vi.fn(),
            status: vi.fn(),
        };

        await runOn(harness, {});

        expect(output.printInfo).toHaveBeenCalledWith(
            "DeepSeek Harness is not ready; run its status command for details.",
        );
        expect(output.printResult).toHaveBeenCalledWith(
            expect.objectContaining({ configured: false }),
        );
        expect(output.printSuccess).not.toHaveBeenCalled();
    });
});
