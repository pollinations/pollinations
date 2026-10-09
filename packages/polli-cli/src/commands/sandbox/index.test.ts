import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (original) => {
    const os = await original<typeof import("node:os")>();
    return { ...os, homedir: vi.fn(os.homedir) };
});

let home: string;

beforeEach(() => {
    vi.resetModules();
    home = mkdtempSync(join(tmpdir(), "polli-sandbox-test-"));
    vi.mocked(homedir).mockReturnValue(home);
    mkdirSync(join(home, ".pollinations", "ssh"), { recursive: true });
    // Avoid generating an SSH key; setup only needs this file to exist.
    writeFileSync(join(home, ".pollinations", "ssh", "id_ed25519"), "");
    mkdirSync(join(home, ".ssh"));
    writeFileSync(join(home, ".ssh", "config"), "Host existing.example\n");
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
});

describe.each(["human", "json"] as const)("sandbox create (%s)", (mode) => {
    async function prepare(response: Response) {
        const { setKeyOverride } = await import("../../lib/config.js");
        const { setOutputMode } = await import("../../lib/output.js");
        setKeyOverride("sk_test");
        setOutputMode(mode);
        let stdout = "";
        let stderr = "";
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            stdout += String(value);
            return true;
        });
        vi.spyOn(process.stderr, "write").mockImplementation((value) => {
            stderr += String(value);
            return true;
        });
        const fetch = vi.fn(async () => response);
        vi.stubGlobal("fetch", fetch);
        const { sandboxCommand } = await import("./index.js");
        return {
            run: () => sandboxCommand.parseAsync(["create"], { from: "user" }),
            output: () => ({ stdout, stderr }),
            fetch,
        };
    }

    it("preserves the created ID when local SSH setup fails", async () => {
        // A directory blocks the native config write.
        const config = join(home, ".pollinations", "ssh", "config");
        mkdirSync(config);
        const command = await prepare(
            Response.json({ sandboxID: "created123" }),
        );

        await expect(command.run()).rejects.toMatchObject({ code: 1 });

        expect(command.fetch).toHaveBeenCalledTimes(1);
        const { stdout, stderr } = command.output();
        expect(stdout).toContain("created123");
        if (mode === "json")
            expect(JSON.parse(stdout)).toEqual({ id: "created123" });
        else expect(stdout).toContain("id: created123");
        expect(stdout).not.toContain("ssh created123.polli");
        expect(stderr).toContain(
            "Sandbox created123 created, but failed to set up ssh",
        );
        expect(stderr).toContain(config);
        expect(stderr).not.toContain("Failed to create sandbox");
        expect(stderr.match(/error:/g)).toHaveLength(1);
    });

    it("keeps normal creation and SSH output unchanged", async () => {
        const command = await prepare(
            Response.json({ sandboxID: "created123" }),
        );

        await command.run();

        const { stdout, stderr } = command.output();
        if (mode === "json") {
            expect(JSON.parse(stdout)).toEqual({
                id: "created123",
                ssh: "ssh created123.polli",
            });
            expect(stderr).toBe("");
        } else {
            expect(stdout).toContain("id: created123");
            expect(stdout).toContain("ssh: ssh created123.polli");
            expect(stderr).toContain(
                "Sandbox created123 created. It pauses after 10 minutes",
            );
        }
        expect(command.fetch).toHaveBeenCalledTimes(1);
        expect(command.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes"),
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    templateID: "pollinations",
                    timeout: 600,
                    autoPause: true,
                }),
            }),
        );
        expect(readFileSync(join(home, ".ssh", "config"), "utf8")).toBe(
            "Include ~/.pollinations/ssh/config\n\nHost existing.example\n",
        );
    });

    it("reports a remote creation failure without running SSH setup", async () => {
        const command = await prepare(
            new Response("template not found", { status: 404 }),
        );

        await expect(command.run()).rejects.toMatchObject({ code: 1 });

        const { stdout, stderr } = command.output();
        expect(stdout).toBe("");
        expect(stderr).toContain("Failed to create sandbox: 404");
        expect(stderr).toContain("template not found");
        expect(stderr).not.toContain("failed to set up ssh");
        expect(stderr.match(/error:/g)).toHaveLength(1);
        expect(readFileSync(join(home, ".ssh", "config"), "utf8")).toBe(
            "Host existing.example\n",
        );
    });
});

describe("sandbox keep", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("renews every 5 minutes, resumes after E2B ends a run, and stops when the sandbox is gone", async () => {
        vi.useFakeTimers();
        const { setKeyOverride } = await import("../../lib/config.js");
        setKeyOverride("sk_test");
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        // Gen grants 10 minutes, then E2B cuts the next lease to 2 minutes.
        const leases = [600_000, 120_000];
        let connects = 0;
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
            if (init.method !== "POST") {
                const endAt = Date.now() + (leases.shift() ?? 0);
                return Response.json({ endAt: new Date(endAt).toISOString() });
            }
            return ++connects < 3
                ? Response.json({ sandboxID: "box1" })
                : new Response("not found", { status: 404 });
        });
        vi.stubGlobal("fetch", fetch);
        const { sandboxCommand } = await import("./index.js");

        const run = sandboxCommand.parseAsync(["keep", "box1"], {
            from: "user",
        });
        const stopped = expect(run).rejects.toMatchObject({ code: 1 });
        await vi.advanceTimersByTimeAsync(0);
        expect(connects).toBe(1);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes/box1/connect"),
            expect.objectContaining({ body: JSON.stringify({ timeout: 600 }) }),
        );
        await vi.advanceTimersByTimeAsync(299_999);
        expect(connects).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(connects).toBe(2);
        // The cut-short lease is renewed 5 s after it ends, not 5 minutes on.
        await vi.advanceTimersByTimeAsync(125_000);
        expect(connects).toBe(3);
        await stopped;
    });
});
