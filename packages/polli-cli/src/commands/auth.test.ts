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
