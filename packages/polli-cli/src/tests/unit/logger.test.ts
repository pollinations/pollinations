import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:path", async () => {
    const actual = await vi.importActual("node:path");
    return { ...actual, join: vi.fn((...args: string[]) => args.join("/")) };
});

vi.mock("node:os", () => ({ homedir: vi.fn(() => "/home/testuser") }));

// Helper: fresh module via resetModules + doMock
async function importWithFs(fsMock: Record<string, unknown>) {
    vi.doMock("node:fs", () => fsMock);
    return await import("../../lib/logger.js");
}

describe("logger", () => {
    const logPath = "/home/testuser/.pollinations/logs/activity.log";

    beforeEach(() => {
        vi.resetModules();
    });

    describe("initLogger", () => {
        it("should create log directory if it does not exist", async () => {
            const fs = { existsSync: vi.fn(() => false), mkdirSync: vi.fn(), statSync: vi.fn() };
            const { initLogger } = await importWithFs(fs);

            await initLogger();

            expect(fs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining(".pollinations/logs"),
                { recursive: true, mode: 0o700 },
            );
        });

        it("should not re-create log directory if it exists", async () => {
            const fs = { existsSync: vi.fn(() => true), mkdirSync: vi.fn(), statSync: vi.fn(() => ({ size: 0 })) };
            const { initLogger } = await importWithFs(fs);

            await initLogger();

            expect(fs.mkdirSync).not.toHaveBeenCalled();
        });
    });

    describe("logActivity", () => {
        function mkFs(overrides?: Record<string, unknown>) {
            return {
                existsSync: vi.fn(() => true),
                mkdirSync: vi.fn(),
                appendFileSync: vi.fn(),
                writeFileSync: vi.fn(),
                renameSync: vi.fn(),
                statSync: vi.fn(() => ({ size: 0 })),
                ...overrides,
            };
        }

        it("should write a JSON line to the log file", async () => {
            const fs = mkFs();
            const { initLogger, logActivity } = await importWithFs(fs);

            await initLogger();
            logActivity("test_event", { userId: "123" });

            expect(fs.appendFileSync).toHaveBeenCalledWith(logPath, expect.any(String), "utf-8");
            const written = JSON.parse(fs.appendFileSync.mock.calls[0][1]);
            expect(written.event).toBe("test_event");
            expect(written.userId).toBe("123");
            expect(written.timestamp).toBeDefined();
        });

        it("should not throw when append fails", async () => {
            const fs = mkFs({ appendFileSync: vi.fn(() => { throw new Error("Disk full"); }) });
            const { initLogger, logActivity } = await importWithFs(fs);

            await initLogger();
            expect(() => logActivity("test", {})).not.toThrow();
        });
    });

    describe("getLogFilePath", () => {
        it("should return the log file path", async () => {
            const fs = { existsSync: vi.fn(), statSync: vi.fn(() => ({ size: 0 })), mkdirSync: vi.fn(), appendFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn() };
            const { getLogFilePath } = await importWithFs(fs);

            expect(getLogFilePath()).toContain("activity.log");
        });
    });
});
