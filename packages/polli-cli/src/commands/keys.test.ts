import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { keysCommand } from "./keys.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
});

const cases = [
    {
        permissions: { account: ["profile", "usage"] },
        text: "account:profile|usage",
    },
    { permissions: { models: ["test-model"] }, text: "models:test-model" },
    {
        permissions: {
            models: ["first", "second", "third"],
            account: ["profile"],
        },
        text: "models:3 account:profile",
    },
    { permissions: { models: [], account: [] }, text: "-" },
    { permissions: null, text: null },
];

function prepare(permissions: unknown) {
    setKeyOverride("sk_test");
    const stdout = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json({
            id: "test-id",
            key: "sk_test_response",
            name: "test",
            type: "secret",
            prefix: "sk",
            expiresAt: null,
            permissions,
            pollenBudget: null,
        }),
    );
    vi.stubGlobal("fetch", fetch);
    return { fetch, stdout };
}

describe("keys create permissions output", () => {
    it.each(cases)("formats human permissions $permissions", async ({
        permissions,
        text,
    }) => {
        const { fetch, stdout } = prepare(permissions);
        await keysCommand.parseAsync(["create", "--name", "test"], {
            from: "user",
        });

        expect(fetch).toHaveBeenCalledOnce();
        const output = stdout.mock.calls
            .map(([chunk]) => String(chunk))
            .join("");
        expect(output).not.toContain("[object Object]");
        if (text === null) {
            expect(output).not.toContain("permissions:");
        } else {
            expect(output).toContain(`permissions: ${text}`);
        }
    });

    it.each(cases)("preserves JSON permissions $permissions", async ({
        permissions,
    }) => {
        const { stdout } = prepare(permissions);
        setOutputMode("json");
        await keysCommand.parseAsync(["create", "--name", "test"], {
            from: "user",
        });

        const output = stdout.mock.calls
            .map(([chunk]) => String(chunk))
            .join("");
        expect(JSON.parse(output).permissions).toEqual(permissions);
    });
});

describe("keys list permissions output", () => {
    it("keeps the existing compact permissions format", async () => {
        const { fetch, stdout } = prepare(null);
        fetch.mockResolvedValue(
            Response.json({
                data: [
                    {
                        id: "test-id",
                        name: "test",
                        prefix: "sk",
                        permissions: {
                            models: ["first", "second", "third"],
                            account: ["profile"],
                        },
                        pollenBalance: null,
                        expiresAt: null,
                        enabled: true,
                    },
                ],
            }),
        );
        await keysCommand.parseAsync(["list"], { from: "user" });

        const output = stdout.mock.calls
            .map(([chunk]) => String(chunk))
            .join("");
        expect(output).toContain("models:3 account:profile");
        expect(output).not.toContain("[object Object]");
    });
});

describe("keys create --expires-in", () => {
    it.each([
        "3600",
        String(400 * 86400),
    ])("sends %s seconds", async (seconds) => {
        const { fetch } = prepare(null);
        await keysCommand.parseAsync(
            ["create", "--name", "test", "--expires-in", seconds],
            { from: "user" },
        );
        expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({
            expiresIn: Number(seconds),
        });
    });

    it.each([
        "abc",
        "Infinity",
        "",
        "0",
        "-1",
        "1.5",
        "9".repeat(16),
    ])("rejects %j without a request", async (seconds) => {
        const { fetch } = prepare(null);
        await expect(
            keysCommand.parseAsync(
                ["create", "--name", "test", "--expires-in", seconds],
                { from: "user" },
            ),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
});
