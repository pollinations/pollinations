import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as toml from "smol-toml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_CLIENTS } from "./clients.js";
import { installMcp, offMcp } from "./index.js";

vi.mock("./catalog.js", async (importOriginal) => {
    const mod = await importOriginal<typeof import("./catalog.js")>();
    return { ...mod, fetchCatalog: async () => catalog };
});

import { applyWithSnapshot, restoreOrStrip } from "../harnesses/snapshot.js";
import type { HarnessContext } from "../harnesses/types.js";
import type { McpCatalogServer } from "./catalog.js";
import {
    CODEX_ENV_VAR,
    codex,
    codexConfigPath,
    codexEnvPath,
    codexPostInstall,
    codexPostStrip,
} from "./codex.js";
import { clobberedNames, entryName, ownedNames } from "./entries.js";

const KEY = "sk_polli_test_key_1234567890";
const URL_BASE = "https://gen.pollinations.ai";

const catalog: McpCatalogServer[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        url: `${URL_BASE}/mcp/pollinations`,
    },
    { id: "ffmpeg", name: "FFmpeg", url: `${URL_BASE}/mcp/ffmpeg` },
    {
        id: "exa",
        name: "Exa Search",
        url: `${URL_BASE}/mcp/exa`,
    },
];

let home: string;
let ctx: HarnessContext;
const originalCwd = process.cwd();

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-mcp-"));
    ctx = { home, env: {} };
    // VS Code targets the workspace config (.vscode/mcp.json): run from a
    // temp cwd so tests never write into the repository itself.
    process.chdir(home);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(home, { recursive: true, force: true });
});

const clientById = (id: string) => {
    const client = MCP_CLIENTS.find((c) => c.id === id);
    if (!client) throw new Error(`missing client ${id}`);
    return client;
};

const read = (path: string) => readFileSync(path, "utf-8");
const writeWithDir = (path: string, content: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
};

describe("entry naming", () => {
    it("keeps pollinations as pollinations and prefixes the rest", () => {
        expect(entryName("pollinations")).toBe("pollinations");
        expect(entryName("ffmpeg")).toBe("pollinations-ffmpeg");
    });
});

describe("json envelope clients", () => {
    it.each([
        "claude-code",
        "cursor",
        "gemini",
        "windsurf",
        "cline",
        "opencode",
        "copilot-cli",
        "amp",
        "kiro",
        "zed",
        "warp",
    ])("%s: installs entries into an empty config", (id) => {
        const client = clientById(id);
        expect(client.readServers(ctx)).toBeNull();
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const servers = client.readServers(ctx) ?? {};
        expect(Object.keys(servers).sort()).toEqual([
            "pollinations",
            "pollinations-exa",
            "pollinations-ffmpeg",
        ]);
    });

    it("claude-code writes a type:http entry with a literal bearer header", () => {
        const client = clientById("claude-code");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const servers = client.readServers(ctx) ?? {};
        const entry = servers.pollinations as Record<string, unknown>;
        expect(entry.type).toBe("http");
        expect(entry.url).toBe(`${URL_BASE}/mcp/pollinations`);
        expect(entry.headers).toEqual({
            Authorization: `Bearer ${KEY}`,
        });
    });

    it("gemini uses httpUrl and windsurf uses serverUrl", () => {
        for (const [id, field] of [
            ["gemini", "httpUrl"],
            ["windsurf", "serverUrl"],
        ] as const) {
            const client = clientById(id);
            client.writeServers(
                ctx,
                client.entries(catalog, KEY) as Record<
                    string,
                    Record<string, unknown>
                >,
            );
            const servers = client.readServers(ctx) ?? {};
            expect(
                (servers["pollinations-ffmpeg"] as Record<string, unknown>)[
                    field
                ],
            ).toBe(`${URL_BASE}/mcp/ffmpeg`);
        }
    });

    it("cline writes the camelCase streamableHttp type", () => {
        const client = clientById("cline");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const servers = client.readServers(ctx) ?? {};
        expect((servers.pollinations as Record<string, unknown>).type).toBe(
            "streamableHttp",
        );
    });

    it("copilot-cli writes tools: ['*'] in entries", () => {
        const client = clientById("copilot-cli");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const servers = client.readServers(ctx) ?? {};
        const entry = servers.pollinations as Record<string, unknown>;
        expect(entry.type).toBe("http");
        expect(entry.tools).toEqual(["*"]);
    });

    it("amp nests servers under the dotted amp.mcpServers key in settings.json", () => {
        const client = clientById("amp");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const config = JSON.parse(read(client.files(ctx)[0]));
        expect(config["amp.mcpServers"].pollinations.url).toBe(
            `${URL_BASE}/mcp/pollinations`,
        );
        expect(config["amp.mcpServers"].pollinations.type).toBeUndefined();
    });

    it("kiro targets ~/.kiro/settings/mcp.json without a type field", () => {
        const client = clientById("kiro");
        expect(client.files(ctx)[0]).toBe(
            join(home, ".kiro", "settings", "mcp.json"),
        );
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.mcpServers.pollinations.url).toBe(
            `${URL_BASE}/mcp/pollinations`,
        );
        expect(config.mcpServers.pollinations.type).toBeUndefined();
    });

    it("zed uses context_servers with plain url + headers", () => {
        const client = clientById("zed");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.context_servers.pollinations.url).toBe(
            `${URL_BASE}/mcp/pollinations`,
        );
        expect(config.context_servers.pollinations.type).toBeUndefined();
        expect(config.context_servers.pollinations.headers.Authorization).toBe(
            `Bearer ${KEY}`,
        );
    });

    it("warp targets ~/.warp/.mcp.json without a type field", () => {
        const client = clientById("warp");
        expect(client.files(ctx)[0]).toBe(join(home, ".warp", ".mcp.json"));
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const servers = client.readServers(ctx) ?? {};
        expect(servers.pollinations.type).toBeUndefined();
        expect(servers.pollinations.url).toBe(`${URL_BASE}/mcp/pollinations`);
    });

    it("is idempotent: reinstalling does not duplicate entries", () => {
        const client = clientById("cursor");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        expect(Object.keys(client.readServers(ctx) ?? {}).length).toBe(3);
    });

    it("preserves unrelated entries and root keys", () => {
        const client = clientById("cursor");
        const configPath = client.files(ctx)[0];
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(
            configPath,
            JSON.stringify(
                {
                    mcpServers: {
                        other: { command: "npx", args: ["other-server"] },
                        pollinations: { url: `${URL_BASE}/mcp/pollinations` },
                        "pollinations-old": { url: `${URL_BASE}/mcp/old` },
                    },
                    otherRootKey: true,
                },
                null,
                2,
            ),
        );
        const servers = client.readServers(ctx) ?? {};
        // The user's own "pollinations"-named server with OUR url is ours;
        // "other" is not.
        expect(ownedNames(servers, "url").sort()).toEqual([
            "pollinations",
            "pollinations-old",
        ]);
        client.writeServers(ctx, { other: servers.other });
        const after = JSON.parse(read(configPath));
        expect(after.otherRootKey).toBe(true);
        expect(after.mcpServers.other).toBeDefined();
        expect(after.mcpServers.pollinations).toBeUndefined();
    });

    it("opencode nests entries under mcp.<name> with remote type", () => {
        const client = clientById("opencode");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.mcp.pollinations.type).toBe("remote");
        expect(config.mcp.pollinations.url).toBe(
            `${URL_BASE}/mcp/pollinations`,
        );
        expect(config.mcp.pollinations.enabled).toBe(true);
        expect(config.mcp.pollinations.headers.Authorization).toBe(
            `Bearer ${KEY}`,
        );
    });

    it("vscode uses the servers key, an input reference, and registers the input", () => {
        const client = clientById("vscode");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        const config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.servers["pollinations-ffmpeg"].url).toBe(
            `${URL_BASE}/mcp/ffmpeg`,
        );
        expect(
            config.servers["pollinations-ffmpeg"].headers.Authorization,
        ).toBe(
            // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code input reference
            "${input:pollinations-api-key}",
        );
        expect(
            config.inputs.some(
                (input: { id?: string }) => input.id === "pollinations-api-key",
            ),
        ).toBe(true);
        // No literal key written in the file.
        expect(read(client.files(ctx)[0])).not.toContain(KEY);
    });

    it("handles 0-byte or whitespace-only config file as empty config", () => {
        const client = clientById("claude-code");
        const configPath = client.files(ctx)[0];
        writeWithDir(configPath, "   \n ");
        expect(client.readServers(ctx)).toEqual({});
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        expect(Object.keys(client.readServers(ctx) ?? {}).length).toBe(3);
    });

    it("vscode removes registered prompt input from inputs array when off is run", async () => {
        const client = clientById("vscode");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        let config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.inputs).toBeDefined();

        await offMcp(ctx, "vscode", undefined);
        config = JSON.parse(read(client.files(ctx)[0]));
        expect(config.inputs).toBeUndefined();
    });

    it("vscode configPath honours VSCODE_MCP_CONFIG", () => {
        const withEnv: HarnessContext = {
            home,
            env: { VSCODE_MCP_CONFIG: "/custom/vscode/mcp.json" },
        };
        expect(clientById("vscode").files(withEnv)[0]).toBe(
            "/custom/vscode/mcp.json",
        );
    });

    it("reinstalling a prompt-input client reuses the registered prompt, no new key", async () => {
        const client = clientById("vscode");
        client.writeServers(
            ctx,
            client.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        // A mint would need the network; with the guard this call stays local.
        const result = await installMcp(ctx, "vscode", ["ffmpeg"], {});
        expect(result.hints?.[0]).toContain("already registered");
    });
});

describe("codex (toml)", () => {
    it("writes TOML entries with bearer_token_env_var and stores the key in .env", () => {
        const client = codex;
        const entries = client.entries(catalog, KEY);
        client.writeServers(
            ctx,
            entries as Record<string, Record<string, unknown>>,
        );
        const parsed = toml.parse(read(codexConfigPath(ctx))) as {
            mcp_servers: Record<
                string,
                { url: string; bearer_token_env_var: string }
            >;
        };
        expect(parsed.mcp_servers["pollinations-ffmpeg"]).toEqual({
            url: `${URL_BASE}/mcp/ffmpeg`,
            bearer_token_env_var: CODEX_ENV_VAR,
        });
        codexPostInstall(ctx, KEY);
        expect(read(codexEnvPath(ctx))).toContain(`${CODEX_ENV_VAR}=${KEY}`);
        expect(client.installedServers(ctx).length).toBe(3);
    });

    it("removes only pollinations entries and keeps the user's own", () => {
        codex.writeServers(ctx, {
            ...codex.entries(catalog, KEY),
            personal: { command: "echo", args: ["hi"] },
        } as Record<string, Record<string, unknown>>);
        const servers = codex.readServers(ctx) ?? {};
        const owned = ownedNames(servers, "url");
        const next = Object.fromEntries(
            Object.entries(servers).filter(([name]) => !owned.includes(name)),
        );
        codex.writeServers(ctx, next);
        expect(codex.installedServers(ctx)).toEqual([]);
        const parsed = toml.parse(read(codexConfigPath(ctx))) as {
            mcp_servers: Record<string, unknown>;
        };
        expect(parsed.mcp_servers.personal).toBeDefined();
        expect(Object.keys(parsed.mcp_servers)).toEqual(["personal"]);
    });

    it("configPath honours CODEX_HOME", () => {
        const withEnv: HarnessContext = {
            home,
            env: { CODEX_HOME: "~/.custom-codex" },
        };
        expect(codexConfigPath(withEnv)).toBe(
            join(home, ".custom-codex", "config.toml"),
        );
        expect(codexEnvPath(withEnv)).toBe(join(home, ".custom-codex", ".env"));
    });

    it("readKey reuses the key stored in .env (idempotent credentials)", () => {
        writeWithDir(
            codexEnvPath(ctx),
            `USER_VAR=keep\n${CODEX_ENV_VAR}=sk_polli_existing\n`,
        );
        expect(codex.readKey?.(ctx)).toBe("sk_polli_existing");
    });

    it("readKey tolerates quoted values and ignores empty assignments", () => {
        writeWithDir(codexEnvPath(ctx), `${CODEX_ENV_VAR}="sk_quoted"\n`);
        expect(codex.readKey?.(ctx)).toBe("sk_quoted");
        writeWithDir(codexEnvPath(ctx), `${CODEX_ENV_VAR}=\nOTHER=1\n`);
        expect(codex.readKey?.(ctx)).toBeNull();
    });
});

describe("offMcp (engine, sin red)", () => {
    it("removes a single server by CATALOG id, keeping the rest", async () => {
        const client = clientById("claude-code");
        const configPath = client.files(ctx)[0];
        mkdirSync(dirname(configPath), { recursive: true });
        // Pre-install manually (sin red): 2 entries owned + 1 ajena
        writeWithDir(
            configPath,
            JSON.stringify({
                mcpServers: {
                    pollinations: {
                        type: "http",
                        url: `${URL_BASE}/mcp/pollinations`,
                    },
                    "pollinations-ffmpeg": {
                        type: "http",
                        url: `${URL_BASE}/mcp/ffmpeg`,
                    },
                    personal: { command: "echo", args: ["hi"] },
                },
            }),
        );
        const result = await offMcp(ctx, "claude-code", ["ffmpeg"]);
        expect(result.outcome).toBe("stripped");
        expect(result.installed.map((entry) => entry.name)).toEqual([
            "pollinations",
        ]);
        const servers = client.readServers(ctx) ?? {};
        expect(servers.personal).toBeDefined();
        expect(servers["pollinations-ffmpeg"]).toBeUndefined();
        expect(servers.pollinations).toBeDefined();
    });

    it("off without server ids removes all owned entries", async () => {
        const client = clientById("claude-code");
        const configPath = client.files(ctx)[0];
        mkdirSync(dirname(configPath), { recursive: true });
        writeWithDir(
            configPath,
            JSON.stringify({
                mcpServers: {
                    "pollinations-ffmpeg": {
                        type: "http",
                        url: `${URL_BASE}/mcp/ffmpeg`,
                    },
                    personal: { command: "echo", args: ["hi"] },
                },
            }),
        );
        const result = await offMcp(ctx, "claude-code", undefined);
        expect(result.outcome).toBe("stripped");
        const servers = client.readServers(ctx) ?? {};
        expect(Object.keys(servers)).toEqual(["personal"]);
    });
});

describe("ownership semantics", () => {
    it("does not strip a foreign pollinations entry with a different URL", () => {
        const client = clientById("cursor");
        const path = client.files(ctx)[0];
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify({
                mcpServers: {
                    pollinations: {
                        url: "https://self-hosted.example/mcp/pollinations",
                    },
                },
            }),
        );
        expect(client.installedServers(ctx)).toEqual([]);
    });

    it("all clients treat our base URL as owned", () => {
        for (const client of MCP_CLIENTS) {
            const entries = client.entries(catalog, KEY);
            expect(Object.keys(entries).length).toBe(3);
        }
    });
});

describe("install collision guard", () => {
    it("flags entries that would clobber a user-owned same-name entry", () => {
        const current = {
            pollinations: {
                url: "https://self-hosted.example/mcp/pollinations",
            },
            "pollinations-ffmpeg": { url: `${URL_BASE}/mcp/ffmpeg` },
        };
        const incoming = {
            pollinations: { url: `${URL_BASE}/mcp/pollinations` },
            "pollinations-ffmpeg": { url: `${URL_BASE}/mcp/ffmpeg` },
        };
        expect(clobberedNames(current, incoming, "url")).toEqual([
            "pollinations",
        ]);
    });

    it("allows reinstall over our own entries", () => {
        const owned = {
            pollinations: { url: `${URL_BASE}/mcp/pollinations` },
        };
        expect(clobberedNames(owned, owned, "url")).toEqual([]);
    });
});

describe("codex env hygiene", () => {
    it("removes the .env file entirely when only our var lived there", () => {
        codex.writeServers(
            ctx,
            codex.entries(catalog, KEY) as Record<
                string,
                Record<string, unknown>
            >,
        );
        codexPostInstall(ctx, KEY);
        expect(existsSync(codexEnvPath(ctx))).toBe(true);
        // Strip all owned entries, then the env var must go with the file.
        const servers = codex.readServers(ctx) ?? {};
        const owned = ownedNames(servers, "url");
        codex.writeServers(
            ctx,
            Object.fromEntries(
                Object.entries(servers).filter(
                    ([name]) => !owned.includes(name),
                ),
            ),
        );
        codexPostStrip(ctx, owned);
        expect(existsSync(codexEnvPath(ctx))).toBe(false);
    });

    it("keeps the .env file when the user has their own vars", () => {
        const envPath = codexEnvPath(ctx);
        mkdirSync(dirname(envPath), { recursive: true });
        writeFileSync(envPath, "USER_VAR=yes\n", "utf-8");
        codexPostStrip(ctx, ["pollinations"]);
        const text = read(envPath);
        expect(text).toContain("USER_VAR=yes");
        expect(text).not.toContain(CODEX_ENV_VAR);
    });
});

describe("snapshot covers postInstall writes (codex .env)", () => {
    it("off restores byte-identically after install+postInstall", () => {
        const envPath = codexEnvPath(ctx);
        const preEnv = "MY_OWN_SECRET=1\n";
        writeWithDir(codexConfigPath(ctx), "# my codex config\n");
        writeFileSync(envPath, preEnv, "utf-8");

        // Same order installMcp uses now: writeServers + postInstall inside
        // the snapshot window, so the persisted afterHash covers both.
        applyWithSnapshot(ctx, "mcp-codex", codex.files(ctx), () => {
            codex.writeServers(
                ctx,
                codex.entries(catalog, KEY) as Record<
                    string,
                    Record<string, unknown>
                >,
            );
            codexPostInstall(ctx, KEY);
        });

        const outcome = restoreOrStrip(
            ctx,
            "mcp-codex",
            codex.files(ctx),
            () => true,
        );
        expect(outcome).toBe("restored");
        expect(read(codexConfigPath(ctx))).toBe("# my codex config\n");
        expect(read(envPath)).toBe(preEnv);
    });
});
