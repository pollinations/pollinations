import { describe, expect, it } from "vitest";
import {
    ALL_CLIENTS,
    AUTH_ENV_VAR,
    type CliAdapter,
    entryUrl,
    type InstallContext,
    type JsonAdapter,
    removeJsonServer,
    serverEntryName,
    upsertJsonServer,
    withEnvVar,
} from "./clients.js";

const ctx: InstallContext = {
    server: {
        id: "computer",
        url: "https://gen.pollinations.ai/mcp/computer",
        name: "Computer",
    },
    apiKey: "sk_test_123",
};

const entry = (overrides: Record<string, unknown> = {}) => ({
    url: ctx.server.url,
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    ...overrides,
});

describe("serverEntryName", () => {
    it("namespaces per server", () => {
        expect(serverEntryName(ctx.server)).toBe("pollinations-computer");
    });
});

describe("upsertJsonServer", () => {
    it("creates the root object and inserts the entry", () => {
        const doc: Record<string, unknown> = {};
        expect(
            upsertJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                entry(),
                ctx.server.url,
            ),
        ).toBe("updated");
        expect(doc.mcpServers).toEqual({
            "pollinations-computer": entry(),
        });
    });

    it("is idempotent when the entry already matches", () => {
        const doc = { mcpServers: { "pollinations-computer": entry() } };
        expect(
            upsertJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                entry(),
                ctx.server.url,
            ),
        ).toBe("unchanged");
    });

    it("replaces our own entry when the key rotates", () => {
        const doc = { mcpServers: { "pollinations-computer": entry() } };
        const rotated = entry({ headers: { Authorization: "Bearer sk_new" } });
        expect(
            upsertJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                rotated,
                ctx.server.url,
            ),
        ).toBe("updated");
    });

    it("refuses to clobber a same-named entry pointing elsewhere", () => {
        const doc = {
            mcpServers: {
                "pollinations-computer": { url: "https://example.com/mcp" },
            },
        };
        expect(
            upsertJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                entry(),
                ctx.server.url,
            ),
        ).toBe("foreign");
        expect(
            (doc.mcpServers as Record<string, unknown>)[
                "pollinations-computer"
            ],
        ).toEqual({
            url: "https://example.com/mcp",
        });
    });
});

describe("removeJsonServer", () => {
    it("removes our own entry", () => {
        const doc = { mcpServers: { "pollinations-computer": entry() } };
        expect(
            removeJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                ctx.server.url,
            ),
        ).toBe("removed");
        expect(doc.mcpServers).toEqual({});
    });

    it("reports absent for a missing entry", () => {
        expect(
            removeJsonServer(
                {},
                "mcpServers",
                "pollinations-computer",
                ctx.server.url,
            ),
        ).toBe("absent");
    });

    it("leaves a foreign entry alone", () => {
        const doc = {
            mcpServers: {
                "pollinations-computer": { url: "https://example.com/mcp" },
            },
        };
        expect(
            removeJsonServer(
                doc,
                "mcpServers",
                "pollinations-computer",
                ctx.server.url,
            ),
        ).toBe("foreign");
        expect(doc.mcpServers).toEqual({
            "pollinations-computer": { url: "https://example.com/mcp" },
        });
    });
});

describe("withEnvVar", () => {
    it("appends when the var is missing", () => {
        const { lines, result } = withEnvVar(["A=1"], AUTH_ENV_VAR, "sk_x");
        expect(result).toBe("appended");
        expect(lines).toEqual(["A=1", `${AUTH_ENV_VAR}=sk_x`]);
    });

    it("is idempotent when the value matches", () => {
        const lines = [`${AUTH_ENV_VAR}=sk_x`];
        const { lines: next, result } = withEnvVar(lines, AUTH_ENV_VAR, "sk_x");
        expect(result).toBe("unchanged");
        expect(next).toBe(lines);
    });

    it("keeps a user-owned different value", () => {
        const lines = [`${AUTH_ENV_VAR}=sk_user_owned`];
        const { lines: next, result } = withEnvVar(lines, AUTH_ENV_VAR, "sk_x");
        expect(result).toBe("kept");
        expect(next).toEqual(lines);
    });
});

describe("json adapters", () => {
    const jsonAdapters = ALL_CLIENTS.filter(
        (a): a is JsonAdapter => a.kind === "json",
    );

    it("cover the documented client set", () => {
        expect(jsonAdapters.map((a) => a.id).sort()).toEqual([
            "claude-desktop",
            "cline",
            "cursor",
            "kiro",
            "opencode",
            "vscode",
            "warp",
            "windsurf",
            "zed",
        ]);
    });

    it("every entry carries the server url and a bearer header", () => {
        for (const adapter of jsonAdapters) {
            const built = adapter.entry(ctx);
            expect(entryUrl(built), adapter.id).toBe(ctx.server.url);
            const headers = built.headers as Record<string, string>;
            expect(headers.Authorization, adapter.id).toBe(
                `Bearer ${ctx.apiKey}`,
            );
        }
    });

    it("remote http entries declare an http-ish transport where the client needs one", () => {
        const byId = new Map(jsonAdapters.map((a) => [a.id, a]));
        expect(byId.get("cline")?.entry(ctx).type).toBe("streamableHttp");
        expect(byId.get("kiro")?.entry(ctx).type).toBe("http");
        expect(byId.get("vscode")?.entry(ctx).type).toBe("http");
        expect(byId.get("opencode")?.entry(ctx).type).toBe("remote");
        expect(byId.get("windsurf")?.entry(ctx).serverUrl).toBe(ctx.server.url);
    });
});

describe("cli adapters", () => {
    const byId = new Map(
        ALL_CLIENTS.filter((a): a is CliAdapter => a.kind === "cli").map(
            (a) => [a.id, a],
        ),
    );

    it("never leak the literal key into the codex config command", () => {
        const args =
            byId.get("codex")?.addArgs(ctx, "pollinations-computer") ?? [];
        expect(args).toContain(ctx.server.url);
        expect(args).toContain(AUTH_ENV_VAR);
        expect(args.join(" ")).not.toContain(ctx.apiKey);
    });

    it("claude and gemini take the literal bearer header", () => {
        for (const id of ["claude", "gemini"]) {
            const args =
                byId.get(id)?.addArgs(ctx, "pollinations-computer") ?? [];
            expect(args).toContain(ctx.server.url);
            expect(args).toContain(`Authorization: Bearer ${ctx.apiKey}`);
        }
    });

    it("remove args keep the same scope as add", () => {
        expect(byId.get("claude")?.removeArgs("pollinations-computer")).toEqual(
            ["mcp", "remove", "pollinations-computer", "--scope", "user"],
        );
        expect(byId.get("codex")?.removeArgs("pollinations-computer")).toEqual([
            "mcp",
            "remove",
            "pollinations-computer",
        ]);
    });
});
