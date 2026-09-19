import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HarnessContext } from "../harnesses/types.js";
import type { McpServer } from "./catalog.js";
import { serverUrl } from "./catalog.js";
import type { McpClient } from "./clients.js";
import {
    clientFiles,
    clientStatus,
    configFile,
    existingSecret,
    findMcpClient,
    installClient,
    installedEntries,
    installedIds,
    MCP_CLIENTS,
    removeClient,
    tomlOwnedIds,
} from "./clients.js";

const POLLINATIONS: McpServer = {
    id: "pollinations",
    name: "Pollinations",
    description: "text and media",
    url: serverUrl("pollinations"),
};

const FFMPEG: McpServer = {
    id: "ffmpeg",
    name: "FFmpeg",
    description: "audio and video",
    url: serverUrl("ffmpeg"),
};

const KEY = "sk_mcp_key";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-mcp-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const client = (id: string) => {
    const found = findMcpClient(id);
    if (!found) throw new Error(`no client ${id}`);
    return found;
};

const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

const entryAt = (config: Record<string, unknown>, key: string, id: string) => {
    const servers = config[key] as Record<string, Record<string, unknown>>;
    return servers[id];
};

const write = (path: string, data: unknown) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2));
};

describe("json clients", () => {
    it("installs, reports and reuses the key already in the config", () => {
        const cursor = client("cursor");
        installClient(ctx, cursor, [POLLINATIONS], KEY);

        const file = join(home, ".cursor", "mcp.json");
        const entry = entryAt(readJson(file), "mcpServers", "pollinations");
        expect(entry.url).toBe(POLLINATIONS.url);
        expect(entry.headers).toEqual({ Authorization: `Bearer ${KEY}` });
        expect(installedIds(ctx, cursor)).toEqual(["pollinations"]);
        expect(existingSecret(ctx, cursor)).toBe(KEY);
        expect(clientStatus(ctx, cursor).files).toEqual([file]);
    });

    it("installs several servers and stays idempotent", () => {
        const cursor = client("cursor");
        installClient(ctx, cursor, [POLLINATIONS, FFMPEG], KEY);
        installClient(ctx, cursor, [POLLINATIONS, FFMPEG], KEY);

        const servers = readJson(configFile(ctx, cursor)).mcpServers as Record<
            string,
            unknown
        >;
        expect(Object.keys(servers).sort()).toEqual(["ffmpeg", "pollinations"]);
        expect(installedIds(ctx, cursor).sort()).toEqual([
            "ffmpeg",
            "pollinations",
        ]);
    });

    it("removes only our entries and leaves the rest of the file alone", () => {
        const cursor = client("cursor");
        const file = configFile(ctx, cursor);
        write(file, {
            mcpServers: {
                mine: { url: "https://example.com/mcp", headers: { X: "1" } },
            },
            theme: "dark",
        });

        installClient(ctx, cursor, [POLLINATIONS], KEY);
        const removal = removeClient(ctx, cursor);

        expect(removal.removed).toEqual(["pollinations"]);
        expect(removal.leftover).toEqual([]);
        const config = readJson(file);
        expect(Object.keys(config.mcpServers as object)).toEqual(["mine"]);
        expect(config.theme).toBe("dark");
    });

    it("recognises an entry by URL, not by its name", () => {
        const cursor = client("cursor");
        const file = configFile(ctx, cursor);
        write(file, {
            mcpServers: {
                "renamed-by-the-user": { url: POLLINATIONS.url },
                other: { url: "https://example.com/mcp" },
            },
        });

        expect(installedIds(ctx, cursor)).toEqual(["pollinations"]);
        expect(existingSecret(ctx, cursor)).toBeNull();
        expect(removeClient(ctx, cursor).removed).toEqual(["pollinations"]);
        expect(Object.keys(readJson(file).mcpServers as object)).toEqual([
            "other",
        ]);
    });

    it.each([
        ["cursor", [".cursor", "mcp.json"], "mcpServers"],
        ["opencode", [".config", "opencode", "opencode.json"], "mcp"],
        ["gemini", [".gemini", "settings.json"], "mcpServers"],
        ["copilot-cli", [".copilot", "mcp-config.json"], "mcpServers"],
        ["windsurf", [".codeium", "windsurf", "mcp_config.json"], "mcpServers"],
        ["cline", [".cline", "mcp.json"], "mcpServers"],
        ["amp", [".config", "amp", "settings.json"], "amp.mcpServers"],
        ["kiro", [".kiro", "settings", "mcp.json"], "mcpServers"],
        ["warp", [".warp", ".mcp.json"], "mcpServers"],
        [
            "zed",
            process.platform === "win32"
                ? ["AppData", "Roaming", "Zed", "settings.json"]
                : [".config", "zed", "settings.json"],
            "context_servers",
        ],
    ] as const)("writes %s in its own format", (id, segments, key) => {
        const target = client(id);
        const file = join(home, ...segments);
        installClient(ctx, target, [POLLINATIONS], KEY);

        expect(configFile(ctx, target)).toBe(file);
        const entry = entryAt(readJson(file), key, "pollinations");
        expect(entry.url ?? entry.serverUrl ?? entry.httpUrl).toBe(
            POLLINATIONS.url,
        );
        expect(entry.headers).toEqual({ Authorization: `Bearer ${KEY}` });
        expect(installedIds(ctx, target)).toEqual(["pollinations"]);
        expect(statSync(file).mode & 0o777).toBe(0o600);

        expect(removeClient(ctx, target).removed).toEqual(["pollinations"]);
        expect(readJson(file)[key]).toBeUndefined();
    });

    it("marks the transport where the client needs it", () => {
        const cases: Array<[string, string, string, string]> = [
            ["claude-code", ".claude.json", "mcpServers", "http"],
            ["opencode", ".config/opencode/opencode.json", "mcp", "remote"],
            ["cline", ".cline/mcp.json", "mcpServers", "streamableHttp"],
        ];
        for (const [id, file, key, type] of cases) {
            const target = client(id);
            installClient(ctx, target, [POLLINATIONS], KEY);
            expect(
                entryAt(
                    readJson(join(home, ...file.split("/"))),
                    key,
                    "pollinations",
                ).type,
            ).toBe(type);
        }
    });

    it("edits the config file the client already has", () => {
        const opencode = client("opencode");
        const file = join(home, ".config", "opencode", "opencode.jsonc");
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(file, `{\n  // before\n  "theme": "polli",\n}\n`);

        installClient(ctx, opencode, [POLLINATIONS], KEY);
        expect(configFile(ctx, opencode)).toBe(file);
        expect(readJson(file).theme).toBe("polli");
    });

    it("tightens a config that was readable by others before the key landed in it", () => {
        const cursor = client("cursor");
        const file = configFile(ctx, cursor);
        write(file, { mcpServers: {} });
        chmodSync(file, 0o644);

        installClient(ctx, cursor, [POLLINATIONS], KEY);

        expect(statSync(file).mode & 0o777).toBe(0o600);
        expect(entryAt(readJson(file), "mcpServers", "pollinations").url).toBe(
            POLLINATIONS.url,
        );
    });
});

describe("clients that keep the key out of their config", () => {
    it("asks VS Code for the key through inputs", () => {
        const vscode = client("vscode");
        installClient(ctx, vscode, [POLLINATIONS], KEY);

        const config = readJson(configFile(ctx, vscode));
        expect(entryAt(config, "servers", "pollinations").headers).toEqual({
            Authorization: "Bearer ${input:polli-mcp-key}",
        });
        expect(config.inputs).toEqual([
            {
                type: "promptString",
                id: "polli-mcp-key",
                description: "Pollinations API key",
                password: true,
            },
        ]);
        expect(readFileSync(configFile(ctx, vscode), "utf-8")).not.toContain(
            KEY,
        );

        const secret = clientFiles(ctx, vscode)[1];
        expect(readFileSync(secret, "utf-8")).toContain(KEY);
        expect(statSync(secret).mode & 0o777).toBe(0o600);
        expect(existingSecret(ctx, vscode)).toBe(KEY);

        expect(removeClient(ctx, vscode).removed).toEqual(["pollinations"]);
        expect(readJson(configFile(ctx, vscode)).inputs).toBeUndefined();
        expect(existsSync(secret)).toBe(false);
    });

    it("reads the sections Codex keeps in TOML", () => {
        const toml = [
            "[mcp_servers.pollinations]",
            `url = "${POLLINATIONS.url}"`,
            'bearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"',
            "",
            "[mcp_servers.figma]",
            'url = "https://mcp.figma.com/mcp"',
            "",
            "[mcp_servers.exa]",
            `url = "${serverUrl("exa")}"`,
            "",
        ].join("\n");

        expect(tomlOwnedIds(toml)).toEqual(["pollinations", "exa"]);
        expect(tomlOwnedIds("")).toEqual([]);
    });

    it("reports Codex servers from its config.toml", () => {
        const codex = client("codex");
        const file = join(home, ".codex", "config.toml");
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(
            file,
            `[mcp_servers.pollinations]\nurl = "${POLLINATIONS.url}"\nbearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"\n`,
        );

        expect(installedIds(ctx, codex)).toEqual(["pollinations"]);
        expect(clientStatus(ctx, codex).servers).toEqual(["pollinations"]);
        expect(clientStatus(ctx, codex).files).toEqual([
            file,
            join(home, ".pollinations", "mcp", "codex.env"),
        ]);

        const secret = join(home, ".pollinations", "mcp", "codex.env");
        mkdirSync(join(home, ".pollinations", "mcp"), { recursive: true });
        writeFileSync(
            secret,
            `POLLI_MCP_CODEX_API_KEY=${JSON.stringify(KEY)}\n`,
        );
        expect(existingSecret(ctx, codex)).toBe(KEY);

        // Without the Codex CLI nothing can be removed, so it is reported, and
        // the key the leftover entry still points at is kept.
        const removal = removeClient(ctx, codex);
        expect(removal.removed).toEqual([]);
        expect(removal.leftover).toEqual(["pollinations"]);
        expect(existsSync(file)).toBe(true);
        expect(existsSync(secret)).toBe(true);
    });
});

describe("claude desktop", () => {
    it("bridges through mcp-remote because it cannot send headers", () => {
        const desktop = client("claude-desktop");
        installClient(ctx, desktop, [POLLINATIONS], KEY);

        const entry = entryAt(
            readJson(configFile(ctx, desktop)),
            "mcpServers",
            "pollinations",
        );
        expect(entry.command).toBe("npx");
        expect(entry.args).toEqual([
            "-y",
            "mcp-remote",
            POLLINATIONS.url,
            "--header",
            `Authorization: Bearer ${KEY}`,
        ]);
    });
});

describe("clients with their own mcp add command", () => {
    const fakeCli = (name: string, log: string) => {
        const dir = join(home, "bin");
        mkdirSync(dir, { recursive: true });
        const script = join(dir, `${name}.js`);
        writeFileSync(
            script,
            `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`,
        );
        writeFileSync(
            join(dir, `${name}.cmd`),
            `@node "%~dp0${name}.js" %*\r\n`,
        );
        writeFileSync(
            join(dir, name),
            `#!/bin/sh\nexec node "${script}" "$@"\n`,
            {
                mode: 0o755,
            },
        );
        return dir;
    };

    const lines = (log: string) =>
        readFileSync(log, "utf-8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string[]);

    it("drives claude mcp add and remove", () => {
        const log = join(home, "claude.log");
        const dir = fakeCli("claude", log);
        const env = {
            ...process.env,
            PATH: [dir, process.env.PATH ?? ""].join(delimiter),
        };
        const withCli = { home, env };

        installClient(withCli, client("claude-code"), [POLLINATIONS], KEY);
        expect(lines(log)).toEqual([
            [
                "mcp",
                "add",
                "--scope",
                "user",
                "--transport",
                "http",
                "pollinations",
                POLLINATIONS.url,
                "--header",
                `Authorization: Bearer ${KEY}`,
            ],
        ]);
        expect(existsSync(join(home, ".claude.json"))).toBe(false);

        // A server the CLI wrote earlier, then removed through the same CLI.
        write(join(home, ".claude.json"), {
            mcpServers: {
                pollinations: { type: "http", url: POLLINATIONS.url },
            },
        });
        expect(removeClient(withCli, client("claude-code")).removed).toEqual([
            "pollinations",
        ]);
        expect(lines(log)).toEqual([
            [
                "mcp",
                "add",
                "--scope",
                "user",
                "--transport",
                "http",
                "pollinations",
                POLLINATIONS.url,
                "--header",
                `Authorization: Bearer ${KEY}`,
            ],
            ["mcp", "remove", "--scope", "user", "pollinations"],
        ]);
        expect(readJson(join(home, ".claude.json")).mcpServers).toBeUndefined();
    });
});

describe("installedEntries", () => {
    it("returns the URL and the key a client was given", () => {
        const cursor = client("cursor");
        installClient(ctx, cursor, [POLLINATIONS, FFMPEG], KEY);
        expect(installedEntries(ctx, cursor)).toEqual([
            { id: "pollinations", url: POLLINATIONS.url, secret: KEY },
            { id: "ffmpeg", url: FFMPEG.url, secret: KEY },
        ]);
    });

    it("ignores entries that do not point at our host", () => {
        const cursor = client("cursor");
        write(configFile(ctx, cursor), {
            mcpServers: {
                pollinations: {
                    url: POLLINATIONS.url,
                    headers: { Authorization: `Bearer ${KEY}` },
                },
                mine: { url: "https://example.com/mcp" },
            },
        });
        expect(installedEntries(ctx, cursor)).toEqual([
            { id: "pollinations", url: POLLINATIONS.url, secret: KEY },
        ]);
    });

    it("falls back to the key file when the config asks for a prompt", () => {
        const vscode = client("vscode");
        installClient(ctx, vscode, [POLLINATIONS], KEY);
        expect(installedEntries(ctx, vscode)).toEqual([
            { id: "pollinations", url: POLLINATIONS.url, secret: KEY },
        ]);
    });

    it("reads the codex entry out of config.toml and its key file", () => {
        const codex = client("codex");
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(
            join(home, ".codex", "config.toml"),
            [
                "[mcp_servers.pollinations]",
                `url = "${POLLINATIONS.url}"`,
                'bearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"',
                "",
                "[mcp_servers.other]",
                'url = "https://example.com/mcp"',
                "",
            ].join("\n"),
        );
        mkdirSync(join(home, ".pollinations", "mcp"), { recursive: true });
        writeFileSync(
            join(home, ".pollinations", "mcp", "codex.env"),
            `POLLI_MCP_CODEX_API_KEY=${JSON.stringify(KEY)}\n`,
        );
        expect(installedEntries(ctx, codex)).toEqual([
            { id: "pollinations", url: POLLINATIONS.url, secret: KEY },
        ]);
    });

    it("reports nothing for a client with no config", () => {
        expect(installedEntries(ctx, client("cursor"))).toEqual([]);
    });
});

describe("detection", () => {
    it("only claims clients that exist on this machine", () => {
        expect(MCP_CLIENTS.filter((entry) => entry.detect(ctx))).toEqual([]);
        mkdirSync(join(home, ".cursor"));
        expect(
            MCP_CLIENTS.map((entry: McpClient) => entry.id).filter((id) =>
                client(id).detect(ctx),
            ),
        ).toEqual(["cursor"]);
    });
});
