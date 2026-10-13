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
    it("saves nothing when the API rejects the key", async () => {
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        vi.stubGlobal("fetch", async () => Response.json({}, { status: 401 }));

        await expect(
            authCommand.parseAsync(["login", "--token", "sk_invalid"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);

        expect(saveCredentials).not.toHaveBeenCalled();
    });
});
