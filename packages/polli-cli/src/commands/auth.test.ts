import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCredentials, setKeyOverride } from "../lib/config.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import { authCommand, loginWithDeviceFlow } from "./auth.js";

vi.mock("../lib/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/config.js")>();
    return { ...actual, saveCredentials: vi.fn() };
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.mocked(saveCredentials).mockClear();
    setKeyOverride(undefined);
    setOutputMode("human");
});

describe("device login output", () => {
    it.each([
        "human",
        "json",
    ] as const)("shows consent before polling in %s mode without exposing the device code", async (mode) => {
        vi.useFakeTimers();
        setOutputMode(mode);
        const stdout = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        const stderr = vi
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true);
        const url = "https://enter.pollinations.ai/device?user_code=DEMO1234";
        let consentVisibleBeforePoll = false;
        vi.stubGlobal("fetch", async (target: string) => {
            if (target.endsWith("/api/device/code")) {
                return Response.json({
                    device_code: "private-device-code",
                    user_code: "DEMO1234",
                    verification_uri_complete: url,
                    expires_in: 15,
                    interval: 5,
                });
            }
            consentVisibleBeforePoll = stderr.mock.calls
                .map(([text]) => String(text))
                .join("")
                .includes(url);
            return Response.json({ error: "access_denied" }, { status: 400 });
        });

        const denied = expect(
            loginWithDeviceFlow({ browser: false }),
        ).rejects.toThrow(ExitSignal);
        await vi.runAllTimersAsync();
        await denied;

        expect(consentVisibleBeforePoll).toBe(true);
        const output = [...stdout.mock.calls, ...stderr.mock.calls]
            .map(([text]) => String(text))
            .join("");
        expect(output).toContain("DEMO1234");
        expect(output).not.toContain("private-device-code");
        expect(saveCredentials).not.toHaveBeenCalled();
    });

    it.each([
        "command",
        "helper",
    ] as const)("keeps %s JSON output separate from credentials", async (caller) => {
        vi.useFakeTimers();
        setOutputMode("json");
        const stdout = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        vi.stubGlobal("fetch", async (target: string) => {
            if (target.endsWith("/api/device/code")) {
                return Response.json({
                    device_code: "private-device-code",
                    user_code: "DEMO1234",
                    verification_uri_complete:
                        "https://enter.pollinations.ai/device?user_code=DEMO1234",
                    expires_in: 15,
                    interval: 5,
                });
            }
            return Response.json(
                target.endsWith("/api/device/token")
                    ? { access_token: "sk_local_test" }
                    : { githubUsername: "local-test" },
            );
        });

        const login =
            caller === "command"
                ? authCommand.parseAsync(["login", "--no-browser"], {
                      from: "user",
                  })
                : loginWithDeviceFlow({ browser: false });
        await vi.runAllTimersAsync();
        await login;

        const output = stdout.mock.calls.map(([text]) => String(text)).join("");
        if (caller === "command")
            expect(JSON.parse(output)).toEqual({ authenticated: true });
        else expect(output).toBe("");
        expect(output).not.toContain("sk_local_test");
        expect(output).not.toContain("private-device-code");
        expect(saveCredentials).toHaveBeenCalledWith({
            apiKey: "sk_local_test",
            keyType: "sk",
        });
    });
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
    it("returns JSON after a verified key is stored without exposing it", async () => {
        setOutputMode("json");
        const stdout = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        vi.stubGlobal("fetch", async (target: string) =>
            Response.json(
                target.endsWith("/account/key")
                    ? { valid: true }
                    : { githubUsername: "local-test" },
            ),
        );
        await authCommand.parseAsync(["login", "--token", "sk_local_test"], {
            from: "user",
        });
        const output = stdout.mock.calls.map(([text]) => String(text)).join("");
        expect(JSON.parse(output)).toEqual({ authenticated: true });
        expect(output).not.toContain("sk_local_test");
        expect(saveCredentials).toHaveBeenCalledWith({
            apiKey: "sk_local_test",
            keyType: "sk",
        });
    });

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
