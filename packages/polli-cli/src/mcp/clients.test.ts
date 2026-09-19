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
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "./catalog.js";
import { findClient, MCP_CLIENTS } from "./clients.js";
import type { McpContext } from "./types.js";

const POLLINATIONS: McpServer = {
    id: "pollinations",
    name: "Pollinations",
    url: "https://gen.pollinations.ai/mcp/pollinations",
};
const EXA: McpServer = {
    id: "exa",
    name: "Exa",
    url: "https://gen.pollinations.ai/mcp/exa",
};

const client = (id: string) => {
    const found = findClient(id);
    if (!found) throw new Error(`missing client ${id}`);
    return found;
};

const read = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, never>;

let home: string;
let db: Record<string, unknown>;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-mcp-clients-"));
    db = {};
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const ctx: McpContext = {
    get home() {
        return home;
    },
    get env() {
        return db as McpContext["env"];
    },
};

describe("json clients", () => {
    it("adds the servers to an existing config and leaves other entries alone", () => {
        const path = join(home, ".cursor", "mcp.json");
        mkdirSync(join(home, ".cursor"), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify({
                mcpServers: { mine: { url: "https://example.com" } },
            }),
        );

        const report = client("cursor").install(
            ctx,
            [POLLINATIONS, EXA],
            "sk_test",
        );
        expect(report.servers).toEqual(["pollinations", "exa"]);

        const config = read(path);
        expect(config.mcpServers).toMatchObject({
            mine: { url: "https://example.com" },
            pollinations: {
                url: POLLINATIONS.url,
                headers: { Authorization: "Bearer sk_test" },
            },
            exa: { url: EXA.url, headers: { Authorization: "Bearer sk_test" } },
        });
        expect(client("cursor").installed(ctx)).toEqual([
            "pollinations",
            "exa",
        ]);
        expect(client("cursor").existingKey(ctx)).toBe("sk_test");
    });

    it("is idempotent and reuses the key that is already in the config", () => {
        const path = join(home, ".cursor", "mcp.json");
        client("cursor").install(ctx, [POLLINATIONS], "sk_test");
        const before = readFileSync(path, "utf-8");
        // A config polli creates is private by default.
        expect(statSync(path).mode & 0o777).toBe(0o600);

        const again = client("cursor").install(ctx, [POLLINATIONS], "sk_test");
        expect(again.notes[0]).toMatch(/Already installed/);
        expect(readFileSync(path, "utf-8")).toBe(before);

        client("cursor").install(ctx, [POLLINATIONS], "sk_new");
        expect(read(path).mcpServers as Record<string, unknown>).toMatchObject({
            pollinations: { headers: { Authorization: "Bearer sk_new" } },
        });
    });

    it("removes only the owned entries", () => {
        const path = join(home, ".cursor", "mcp.json");
        mkdirSync(join(home, ".cursor"), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify({
                mcpServers: { mine: { url: "https://example.com" } },
            }),
        );
        client("cursor").install(ctx, [POLLINATIONS, EXA], "sk_test");

        const report = client("cursor").remove(ctx, []);
        expect(report.servers).toEqual(["pollinations", "exa"]);
        expect(read(path).mcpServers).toEqual({
            mine: { url: "https://example.com" },
        });

        const empty = client("cursor").remove(ctx, []);
        expect(empty.servers).toEqual([]);
        expect(empty.notes[0]).toMatch(/No Pollinations entries/);
    });

    it("keeps the VS Code key out of the config file", () => {
        const path = join(home, ".config", "Code", "User", "mcp.json");
        const report = client("vscode").install(
            ctx,
            [POLLINATIONS, EXA],
            "sk_test",
        );
        expect(report.notes.join("\n")).toContain("sk_test");

        const config = read(path);
        expect(config.servers).toMatchObject({
            pollinations: {
                type: "http",
                url: POLLINATIONS.url,
                headers: {
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code input reference
                    Authorization: "Bearer ${input:pollinations-mcp-key}",
                },
            },
        });
        expect(config.inputs).toEqual([
            {
                type: "promptString",
                id: "pollinations-mcp-key",
                description: "Pollinations API key",
            },
        ]);
        expect(readFileSync(path, "utf-8")).not.toContain("sk_test");
        expect(client("vscode").existingKey(ctx)).toBe(null);

        client("vscode").remove(ctx, ["pollinations"]);
        expect(read(path).inputs).toBeDefined();
        client("vscode").remove(ctx, []);
        expect(read(path).inputs).toBeUndefined();
        expect(read(path).servers).toBeUndefined();
    });

    it("keeps other settings in a JSONC file and reports the rewrite", () => {
        const path = join(home, ".config", "zed", "settings.json");
        mkdirSync(join(home, ".config", "zed"), { recursive: true });
        writeFileSync(path, '{\n  // keep me\n  "theme": "One Dark",\n}\n');

        const report = client("zed").install(ctx, [POLLINATIONS], "sk_test");
        expect(report.notes.join("\n")).toMatch(/JSON with comments/);
        const config = read(path);
        expect(config.theme).toBe("One Dark");
        expect(config.context_servers).toMatchObject({
            pollinations: {
                url: POLLINATIONS.url,
                headers: { Authorization: "Bearer sk_test" },
            },
        });
    });

    it("uses each client's own config shape", () => {
        const expectations: Array<[string, string, Record<string, unknown>]> = [
            ["opencode", "mcp", { type: "remote", enabled: true }],
            ["windsurf", "mcpServers", { serverUrl: POLLINATIONS.url }],
            [
                "cline",
                "mcpServers",
                { type: "streamableHttp", url: POLLINATIONS.url },
            ],
            ["kiro", "mcpServers", { url: POLLINATIONS.url }],
            ["warp", "mcpServers", { url: POLLINATIONS.url }],
            ["copilot", "mcpServers", { type: "http", url: POLLINATIONS.url }],
        ];
        for (const [id, table, expected] of expectations) {
            client(id).install(ctx, [POLLINATIONS], "sk_test");
            const [path] = client(id).configPaths(ctx);
            const config = read(path);
            const entry = (config[table] as Record<string, unknown>)
                .pollinations as Record<string, unknown>;
            expect(entry, id).toMatchObject(expected);
            expect(entry.headers).toEqual({ Authorization: "Bearer sk_test" });
        }
    });
});

const FAKE_JSON_CLI = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, args.join(" ") + "\\n");
const file = process.env.FAKE_CONFIG;
const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
const write = (data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\\n"); };
const data = read();
const keys = (process.env.FAKE_TABLE || "mcpServers").split(".");
let node = data;
for (const key of keys.slice(0, -1)) { node[key] = node[key] || {}; node = node[key]; }
const table = (node[keys[keys.length - 1]] = node[keys[keys.length - 1]] || {});
const positional = [];
let header = null;
for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--header") { header = args[i + 1]; i += 1; continue; }
    if (arg === "--scope" || arg === "--transport") { i += 1; continue; }
    positional.push(arg);
}
if (args[1] === "add") {
    const headers = {};
    if (header) {
        const separator = header.indexOf("=") === -1 ? header.indexOf(":") : header.indexOf("=");
        headers[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
    }
    table[positional[2]] = { type: "http", url: positional[3], headers };
    write(data);
    process.exit(0);
}
if (args[1] === "remove") {
    delete table[args[args.length - 1]];
    write(data);
    process.exit(0);
}
process.exit(1);
`;

const FAKE_CODEX_CLI = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, args.join(" ") + "\\n");
const file = process.env.FAKE_CONFIG;
const read = () => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
const strip = (source, name) => {
    const kept = [];
    let inside = false;
    for (const line of source.split("\\n")) {
        if (line.startsWith("[")) inside = line.trim() === "[mcp_servers." + name + "]";
        if (!inside) kept.push(line);
    }
    return kept.join("\\n").trim();
};
const write = (text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text + "\\n"); };
if (args[1] === "add") {
    const name = args[2];
    let url = "";
    let envVar = "";
    for (let i = 3; i < args.length; i += 1) {
        if (args[i] === "--url") { url = args[i + 1]; i += 1; continue; }
        if (args[i] === "--bearer-token-env-var") { envVar = args[i + 1]; i += 1; }
    }
    const previous = strip(read(), name);
    const block = "[mcp_servers." + name + "]\\nurl = \\"" + url + "\\"\\nbearer_token_env_var = \\"" + envVar + "\\"";
    write(previous ? previous + "\\n\\n" + block : block);
    process.exit(0);
}
if (args[1] === "remove") {
    write(strip(read(), args[2]));
    process.exit(0);
}
process.exit(1);
`;

const fakeCli = (name: string, body: string) => {
    const dir = join(home, "bin");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, name);
    writeFileSync(path, body);
    chmodSync(path, 0o755);
    return dir;
};

const cliEnv = (dir: string, config: string, log: string, table?: string) => {
    db = {
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        FAKE_CONFIG: config,
        FAKE_LOG: log,
        ...(table ? { FAKE_TABLE: table } : {}),
    } as unknown as McpContext["env"];
};

const logLines = (log: string) =>
    existsSync(log)
        ? readFileSync(log, "utf-8").trim().split("\n").filter(Boolean)
        : [];

describe("cli clients", () => {
    const cases = [
        {
            id: "claude-code",
            bin: "claude",
            segments: [".claude.json"],
            table: "mcpServers",
            add: (server: McpServer) =>
                `mcp add --scope user --transport http ${server.id} ${server.url} --header Authorization: Bearer sk_test`,
            remove: (name: string) => `mcp remove --scope user ${name}`,
        },
        {
            id: "gemini",
            bin: "gemini",
            segments: [".gemini", "settings.json"],
            table: "mcpServers",
            add: (server: McpServer) =>
                `mcp add --scope user --transport http ${server.id} ${server.url} --header Authorization: Bearer sk_test`,
            remove: (name: string) => `mcp remove --scope user ${name}`,
        },
        {
            id: "amp",
            bin: "amp",
            segments: [".config", "amp", "settings.json"],
            table: "amp.mcpServers",
            add: (server: McpServer) =>
                `mcp add ${server.id} ${server.url} --header Authorization=Bearer sk_test`,
            remove: (name: string) => `mcp remove ${name}`,
        },
    ];

    for (const testCase of cases) {
        const { id, bin, segments, table } = testCase;
        it(`installs, reuses and removes with the ${bin} CLI`, () => {
            const dir = fakeCli(bin, FAKE_JSON_CLI);
            const config = join(home, ...segments);
            const log = join(home, `${id}.log`);
            cliEnv(dir, config, log, table);
            const target = client(id);

            expect(target.available(ctx)).toBe(true);

            const report = target.install(ctx, [POLLINATIONS, EXA], "sk_test");
            expect(report.servers).toEqual(["pollinations", "exa"]);
            expect(logLines(log)).toEqual([
                testCase.add(POLLINATIONS),
                testCase.add(EXA),
            ]);
            expect(target.installed(ctx)).toEqual(["pollinations", "exa"]);
            expect(target.existingKey(ctx)).toBe("sk_test");

            target.install(ctx, [POLLINATIONS], "sk_test");
            expect(logLines(log)).toHaveLength(2);

            const removed = target.remove(ctx, ["exa"]);
            expect(removed.servers).toEqual(["exa"]);
            expect(logLines(log)[2]).toBe(testCase.remove("exa"));
            expect(target.installed(ctx)).toEqual(["pollinations"]);
            target.remove(ctx, []);
            expect(logLines(log)[3]).toBe(testCase.remove("pollinations"));
            expect(target.installed(ctx)).toEqual([]);
        });
    }

    it("reports clients that are not installed", () => {
        db = { PATH: join(home, "empty-bin") } as unknown as McpContext["env"];
        expect(client("claude-code").available(ctx)).toBe(false);
        expect(client("codex").available(ctx)).toBe(false);
    });

    it("keeps the Codex key in an env file instead of config.toml", () => {
        const dir = fakeCli("codex", FAKE_CODEX_CLI);
        const config = join(home, ".codex", "config.toml");
        const envFile = join(home, ".codex", ".env");
        const log = join(home, "codex.log");
        cliEnv(dir, config, log);
        const target = client("codex");

        const report = target.install(ctx, [POLLINATIONS], "sk_test");
        expect(logLines(log)).toEqual([
            `mcp add pollinations --url ${POLLINATIONS.url} --bearer-token-env-var POLLI_MCP_CODEX_API_KEY`,
        ]);
        expect(readFileSync(config, "utf-8")).toContain(
            "[mcp_servers.pollinations]",
        );
        expect(readFileSync(config, "utf-8")).toContain(
            'bearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"',
        );
        expect(readFileSync(config, "utf-8")).not.toContain("sk_test");
        expect(readFileSync(envFile, "utf-8")).toContain(
            "POLLI_MCP_CODEX_API_KEY=sk_test",
        );
        expect(statSync(envFile).mode & 0o777).toBe(0o600);
        expect(report.notes.join("\n")).toContain("$POLLI_MCP_CODEX_API_KEY");
        expect(target.installed(ctx)).toEqual(["pollinations"]);
        expect(target.existingKey(ctx)).toBe("sk_test");

        target.install(ctx, [POLLINATIONS], "sk_test");
        expect(logLines(log)).toHaveLength(1);

        target.install(ctx, [POLLINATIONS], "sk_new");
        expect(logLines(log)).toHaveLength(3);
        expect(readFileSync(envFile, "utf-8")).toContain(
            "POLLI_MCP_CODEX_API_KEY=sk_new",
        );

        target.remove(ctx, []);
        expect(logLines(log)[3]).toBe("mcp remove pollinations");
        expect(existsSync(envFile)).toBe(false);
        expect(target.installed(ctx)).toEqual([]);
    });
});

describe("client registry", () => {
    it("exposes every client exactly once", () => {
        const ids = MCP_CLIENTS.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain("claude-code");
        expect(findClient(" Claude-Code ")).not.toBe(null);
        expect(findClient("nope")).toBe(null);
    });
});
