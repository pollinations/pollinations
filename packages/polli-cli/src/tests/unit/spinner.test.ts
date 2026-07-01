import { describe, it, expect, beforeEach, vi } from "vitest";

function makeFreshMocks() {
    const oraInstance = {
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        text: "",
    };

    const output = {
        getOutputMode: vi.fn(() => "human"),
        isQuietMode: vi.fn(() => false),
    };

    return { oraInstance, output };
}

describe("spinner", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    describe("startSpinner", () => {
        it("should start a spinner with given text", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn((opts: { text?: string }) => {
                    if (opts?.text !== undefined) oraInstance.text = opts.text;
                    return oraInstance;
                }),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { startSpinner } = await import("../../lib/spinner.js");
            startSpinner("Generating image...");

            expect(oraInstance.start).toHaveBeenCalled();
            expect(oraInstance.text).toBe("Generating image...");
        });

        it("should not start spinner in quiet mode", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            output.isQuietMode.mockReturnValue(true);
            output.getOutputMode.mockReturnValue("human");

            const { startSpinner } = await import("../../lib/spinner.js");
            startSpinner("Quiet task");

            expect(oraInstance.start).not.toHaveBeenCalled();
        });

        it("should not start spinner in json mode", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            output.getOutputMode.mockReturnValue("json");

            const { startSpinner } = await import("../../lib/spinner.js");
            startSpinner("JSON task");

            expect(oraInstance.start).not.toHaveBeenCalled();
        });
    });

    describe("stopSpinner", () => {
        it("should stop spinner with success", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { startSpinner, stopSpinner } = await import("../../lib/spinner.js");
            startSpinner("Working...");
            stopSpinner(true, "Done!");

            expect(oraInstance.succeed).toHaveBeenCalledWith("Done!");
        });

        it("should stop spinner with failure", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { startSpinner, stopSpinner } = await import("../../lib/spinner.js");
            startSpinner("Working...");
            stopSpinner(false, "Failed!");

            expect(oraInstance.fail).toHaveBeenCalledWith("Failed!");
        });

        it("should do nothing if no spinner is active", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { stopSpinner } = await import("../../lib/spinner.js");
            expect(() => stopSpinner(true)).not.toThrow();
        });
    });

    describe("updateSpinner", () => {
        it("should update spinner text when active", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn((opts: { text?: string }) => {
                    if (opts?.text !== undefined) oraInstance.text = opts.text;
                    return oraInstance;
                }),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { startSpinner, updateSpinner } = await import("../../lib/spinner.js");
            startSpinner("Working...");
            updateSpinner("Still working...");

            expect(oraInstance.text).toBe("Still working...");
        });

        it("should not throw when no spinner is active", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { updateSpinner } = await import("../../lib/spinner.js");
            expect(() => updateSpinner("Nothing")).not.toThrow();
        });
    });

    describe("withSpinner", () => {
        it("should return the result of the wrapped function", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { withSpinner } = await import("../../lib/spinner.js");
            const fn = vi.fn().mockResolvedValue("result");
            const result = await withSpinner("Processing...", fn);

            expect(result).toBe("result");
            expect(oraInstance.succeed).toHaveBeenCalled();
        });

        it("should propagate errors", async () => {
            const { oraInstance, output } = makeFreshMocks();
            vi.doMock("ora", () => ({
                default: vi.fn(() => oraInstance),
            }));
            vi.doMock("../../lib/output.js", () => output);

            const { withSpinner } = await import("../../lib/spinner.js");
            const fn = vi.fn().mockRejectedValue(new Error("Oops"));
            await expect(withSpinner("Processing...", fn)).rejects.toThrow("Oops");

            expect(oraInstance.fail).toHaveBeenCalledWith("Oops");
        });
    });
});
