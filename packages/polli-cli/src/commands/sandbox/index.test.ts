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
            run: (...args: string[]) =>
                sandboxCommand.parseAsync(["create", ...args], {
                    from: "user",
                }),
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

    it("asks gen to keep the sandbox with --keep", async () => {
        const command = await prepare(
            Response.json({ sandboxID: "created123" }),
        );

        await command.run("--keep");

        expect(command.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes"),
            expect.objectContaining({
                body: JSON.stringify({
                    templateID: "pollinations",
                    timeout: 600,
                    autoPause: true,
                    metadata: { pollinations_keep: "true" },
                }),
            }),
        );
        if (mode === "human") {
            expect(command.output().stderr).toContain(
                "It runs until you pause or kill it",
            );
        }
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
