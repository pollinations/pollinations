import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCredentials, setKeyOverride } from "../lib/config.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import { authCommand } from "./auth.js";

vi.mock("../lib/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/config.js")>();
    return { ...actual, saveCredentials: vi.fn() };
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(saveCredentials).mockClear();
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

describe("auth login with a key", () => {
    it("does not replace stored credentials when the API rejects the key", async () => {
        const stderr = vi
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { error: { message: "Invalid API key" } },
                    { status: 401, statusText: "Unauthorized" },
                ),
            ),
        );

        await expect(
            authCommand.parseAsync(
                ["login", "--token", "sk_definitely_invalid"],
                { from: "user" },
            ),
        ).rejects.toThrow(ExitSignal);

        expect(saveCredentials).not.toHaveBeenCalled();
        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining("Invalid API key. Nothing was saved."),
        );
    });

    it("stores a key only after /account/key verifies it", async () => {
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const fetch = vi.fn(async (url: string) =>
            Response.json(
                url.includes("/account/key")
                    ? { valid: true }
                    : { githubUsername: "test" },
            ),
        );
        vi.stubGlobal("fetch", fetch);

        await authCommand.parseAsync(["login", "--token", "sk_verified"], {
            from: "user",
        });

        expect(fetch.mock.calls[0]?.[0]).toContain("/account/key");
        expect(saveCredentials).toHaveBeenCalledWith({
            apiKey: "sk_verified",
            keyType: "sk",
        });
    });
});
