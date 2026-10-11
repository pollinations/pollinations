import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { authCommand } from "./auth.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
});

describe("auth status", () => {
    it("shows the wallet as pollen and the key budget separately", async () => {
        setKeyOverride("sk_test");
        setOutputMode("json");
        const stdout = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        vi.stubGlobal("fetch", async (url: string) =>
            Response.json(
                url.includes("/account/balance")
                    ? {
                          balance: 4.4691,
                          accountBalance: { total: 0, tier: 0, paid: 0 },
                      }
                    : { githubUsername: "test" },
            ),
        );

        await authCommand.parseAsync(["status"], { from: "user" });

        expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({
            pollen: 0,
            key_budget: 4.4691,
        });
    });
});

describe("auth login", () => {
    it("rejects an invalid token with 401 and does not store it", async () => {
        const stderr: string[] = [];
        vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
            stderr.push(String(chunk));
            return true;
        });
        vi.stubGlobal("fetch", async (url: string) => {
            if (url.includes("/account/key")) {
                return new Response("Unauthorized", {
                    status: 401,
                    statusText: "Unauthorized",
                });
            }
            return Response.json({});
        });

        await expect(
            authCommand.parseAsync(
                ["login", "--token", "sk_invalid_test_key"],
                { from: "user" },
            ),
        ).rejects.toThrow("exit 1");

        expect(stderr.join("")).toContain("Invalid API key");
    });

    it("rejects a token when /account/key returns valid: false", async () => {
        const stderr: string[] = [];
        vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
            stderr.push(String(chunk));
            return true;
        });
        vi.stubGlobal("fetch", async (url: string) => {
            if (url.includes("/account/key")) {
                return Response.json({ valid: false });
            }
            return Response.json({});
        });

        await expect(
            authCommand.parseAsync(
                ["login", "--token", "sk_invalid_test_key"],
                { from: "user" },
            ),
        ).rejects.toThrow("exit 1");

        expect(stderr.join("")).toContain("Invalid API key");
    });

    it("stores the key when verification succeeds", async () => {
        const stderr: string[] = [];
        vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
            stderr.push(String(chunk));
            return true;
        });
        vi.stubGlobal("fetch", async (url: string) => {
            if (url.includes("/account/key")) {
                return Response.json({ valid: true });
            }
            if (url.includes("/account/profile")) {
                return Response.json({ githubUsername: "testuser" });
            }
            return Response.json({});
        });

        await authCommand.parseAsync(
            ["login", "--token", "sk_valid_test_key"],
            { from: "user" },
        );

        expect(stderr.join("")).toContain("Authenticated. Key stored.");
        expect(stderr.join("")).toContain("Logged in as testuser");
    });

    it("rejects an invalid token piped via --with-token and leaves credentials unchanged", async () => {
        const stderr: string[] = [];
        vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
            stderr.push(String(chunk));
            return true;
        });
        const { Readable } = await import("node:stream");
        const originalStdin = process.stdin;
        Object.defineProperty(process, "stdin", {
            configurable: true,
            value: Readable.from([Buffer.from("sk_invalid_pipe\n")]),
        });
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: false,
        });

        vi.stubGlobal("fetch", async (url: string) => {
            if (url.includes("/account/key")) {
                return new Response("Unauthorized", {
                    status: 401,
                    statusText: "Unauthorized",
                });
            }
            return Response.json({});
        });

        try {
            await expect(
                authCommand.parseAsync(["login", "--with-token"], {
                    from: "user",
                }),
            ).rejects.toThrow("exit 1");
            expect(stderr.join("")).toContain("Invalid API key");
        } finally {
            Object.defineProperty(process, "stdin", {
                configurable: true,
                value: originalStdin,
            });
        }
    });
});
