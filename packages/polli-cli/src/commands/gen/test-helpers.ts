import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { type OutputMode, setOutputMode } from "../../lib/output.js";

const originalCwd = process.cwd();

export interface GenCommand {
    parseAsync: (argv: string[], opts: { from: string }) => Promise<unknown>;
}

export interface Call {
    url: string;
    init: RequestInit;
}

export interface Ctx {
    out: string;
    calls: Call[];
    folder: string;
}

/**
 * Run a gen command in a throwaway cwd with the API stubbed, then assert while
 * still inside that folder — the finally block cleans up afterwards.
 */
export const runCommand = async (
    command: GenCommand,
    argv: string[],
    respond: (url: string, init: RequestInit) => Response,
    assert: (ctx: Ctx) => void,
    mode: OutputMode = "json",
) => {
    const folder = mkdtempSync(join(tmpdir(), "polli-gen-"));
    const out: string[] = [];
    const calls: Call[] = [];
    process.chdir(folder);
    setKeyOverride("sk_test");
    // Commands read the global output mode; --json is a root-level option.
    setOutputMode(mode);
    // A TTY keeps readStdin() from waiting for piped input that never arrives.
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: true,
    });

    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        out.push(String(value));
        return true;
    });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return respond(url, init);
    });

    try {
        await command.parseAsync(argv, { from: "user" });
        assert({ out: out.join(""), calls, folder });
    } finally {
        process.chdir(originalCwd);
        rmSync(folder, { recursive: true, force: true });
    }
};

/** exitWithError exits the process; assert that instead of an exception. */
export const expectExit = async (command: GenCommand, argv: string[]) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((
        code?: number,
    ) => {
        throw new Error(`exit:${code}`);
    }) as never);
    await expect(command.parseAsync(argv, { from: "user" })).rejects.toThrow(
        /exit:1/,
    );
    exit.mockRestore();
};

export const resetOutput = () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
};
