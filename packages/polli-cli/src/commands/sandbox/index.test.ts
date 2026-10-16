import {
    fstatSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (original) => {
    const os = await original<typeof import("node:os")>();
    return { ...os, homedir: vi.fn(os.homedir) };
});

vi.mock("node:fs", async (original) => {
    const fs = await original<typeof import("node:fs")>();
    return {
        ...fs,
        openSync: vi.fn(fs.openSync),
        fstatSync: vi.fn(fs.fstatSync),
    };
});

let home: string;

beforeEach(() => {
    vi.resetModules();
    // Short, so ssh's connection-sharing socket path fits.
    home = mkdtempSync("/tmp/polli-");
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
                "Sandbox created123 created. It pauses after 10 minutes without an ssh session; `--timeout 0` keeps it running.",
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

    it("asks for E2B's largest timeout with --timeout 0", async () => {
        const command = await prepare(
            Response.json({ sandboxID: "created123" }),
        );

        await command.run("--timeout", "0");

        expect(command.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes"),
            expect.objectContaining({
                body: JSON.stringify({
                    templateID: "pollinations",
                    timeout: 2 ** 31 - 1,
                    autoPause: true,
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

describe("sandbox timeout and pause", () => {
    async function prepare() {
        const { setKeyOverride } = await import("../../lib/config.js");
        setKeyOverride("sk_test");
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const fetch = vi.fn(async () => Response.json({ sandboxID: "sbx1" }));
        vi.stubGlobal("fetch", fetch);
        const { sandboxCommand } = await import("./index.js");
        return {
            run: (...args: string[]) =>
                sandboxCommand.parseAsync(args, { from: "user" }),
            fetch,
        };
    }

    it("never expires a sandbox with a timeout of 0", async () => {
        const command = await prepare();

        await command.run("timeout", "sbx1", "0");

        expect(command.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes/sbx1/connect"),
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ timeout: 2 ** 31 - 1 }),
            }),
        );
    });

    it("pauses a sandbox", async () => {
        const command = await prepare();

        await command.run("pause", "sbx1");

        expect(command.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/alpha/e2b/sandboxes/sbx1/pause"),
            expect.objectContaining({ method: "POST" }),
        );
    });
});

describe("ssh connections", () => {
    async function prepare(response: Response) {
        const { setKeyOverride } = await import("../../lib/config.js");
        setKeyOverride("sk_test");
        let stderr = "";
        vi.spyOn(process.stderr, "write").mockImplementation((value) => {
            stderr += String(value);
            return true;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => response),
        );
        const { sandboxCommand } = await import("./index.js");
        return {
            run: (...args: string[]) =>
                sandboxCommand.parseAsync(args, { from: "user" }),
            stderr: () => stderr,
        };
    }

    it("writes a config that shares one connection between ssh, scp and rsync", async () => {
        const { setupSsh } = await import("./ssh.js");

        setupSsh();

        const config = readFileSync(
            join(home, ".pollinations", "ssh", "config"),
            "utf8",
        );
        expect(config).toContain("ControlMaster auto");
        expect(config).toContain("ControlPersist 10m");
    });

    it("doesn't share connections when the socket path would be too long", async () => {
        const long = join(home, "a-long-company-managed-account-name");
        mkdirSync(join(long, ".pollinations", "ssh"), { recursive: true });
        writeFileSync(join(long, ".pollinations", "ssh", "id_ed25519"), "");
        vi.mocked(homedir).mockReturnValue(long);
        const { setupSsh } = await import("./ssh.js");

        setupSsh();

        const config = readFileSync(
            join(long, ".pollinations", "ssh", "config"),
            "utf8",
        );
        expect(config).not.toContain("ControlMaster");
    });

    it("prints Gen's refusal as a sentence on the terminal, where ssh doesn't hide it", async () => {
        const tty = join(home, "tty");
        const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
        // ssh with ControlPersist gives the proxy /dev/null as stderr.
        vi.mocked(fstatSync).mockImplementation(((fd: number) =>
            fd === 2
                ? fs.statSync("/dev/null")
                : fs.fstatSync(fd)) as typeof fstatSync);
        vi.mocked(openSync).mockImplementation((path, ...rest) =>
            fs.openSync(path === "/dev/tty" ? tty : path, ...rest),
        );
        const command = await prepare(
            Response.json(
                {
                    code: 429,
                    message:
                        "At most 3 sandboxes can run at once. Kill or pause one first.",
                },
                { status: 429 },
            ),
        );

        await expect(
            command.run("proxy", "paused1.polli"),
        ).rejects.toMatchObject({ code: 1 });

        const shown = readFileSync(tty, "utf8");
        expect(shown).toContain(
            "Could not reach sandbox paused1.polli: At most 3 sandboxes can run at once. Kill or pause one first.\nSee your sandboxes: polli sandbox list",
        );
        expect(command.stderr()).toBe("");
    });
});

describe("sandbox list", () => {
    it("shows a sandbox's name, and none for an unnamed one", async () => {
        const { setKeyOverride } = await import("../../lib/config.js");
        const { setOutputMode } = await import("../../lib/output.js");
        setKeyOverride("sk_test");
        setOutputMode("human");
        let stdout = "";
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            stdout += String(value);
            return true;
        });
        const sandbox = {
            templateID: "pollinations",
            state: "paused",
            cpuCount: 2,
            memoryMB: 2048,
            endAt: "2026-10-14T00:00:00Z",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json([
                    {
                        ...sandbox,
                        sandboxID: "sbx1",
                        metadata: { name: "brave-otter" },
                    },
                    { ...sandbox, sandboxID: "sbx2" },
                ]),
            ),
        );
        const { sandboxCommand } = await import("./index.js");

        await sandboxCommand.parseAsync(["list"], { from: "user" });

        expect(stdout).toMatch(/sbx1\s+brave-otter\s+pollinations/);
        expect(stdout).toMatch(/sbx2\s+pollinations/);
    });
});
