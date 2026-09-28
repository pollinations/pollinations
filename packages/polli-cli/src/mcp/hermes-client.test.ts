import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { BASE_URL } from "../lib/config.js";
import type { McpServer } from "./catalog.js";
import { findClient, type McpContext } from "./clients.js";

const SERVERS: McpServer[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        url: `${BASE_URL}/mcp/pollinations`,
    },
    { id: "ffmpeg", name: "FFmpeg", url: `${BASE_URL}/mcp/ffmpeg` },
];

let home: string;
let ctx: McpContext;
let configFile: string;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-mcp-"));
    ctx = { home, env: { HERMES_HOME: join(home, "hermes-home") } };
    configFile = join(home, "hermes-home", "config.yaml");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const read = () => parse(readFileSync(configFile, "utf-8"));
const hermes = () => findClient("hermes");

describe("Hermes MCP client", () => {
    it("is registered as an installable client", () => {
        expect(hermes()).toMatchObject({
            id: "hermes",
            label: "Hermes Agent",
        });
    });

    it("writes hosted servers into mcp_servers and keeps the rest of the config", async () => {
        const { mkdirSync, writeFileSync } = await import("node:fs");
        mkdirSync(join(home, "hermes-home"), { recursive: true });
        writeFileSync(
            configFile,
            [
                "model: keep-me",
                "skills:",
                "  auto_load:",
                "    - god-mode-bootstrap",
                "mcp_servers:",
                "  clawlink:",
                "    enabled: true",
                "    url: https://claw-link.dev/api/mcp",
                "",
            ].join("\n"),
        );

        const result = await hermes()?.install(ctx, SERVERS, "sk-test");
        const config = read();

        expect(result?.installed.sort()).toEqual(["ffmpeg", "pollinations"]);
        expect(result?.files).toEqual([configFile]);
        // Untouched sections survive.
        expect(config.model).toBe("keep-me");
        expect(config.skills).toMatchObject({
            auto_load: ["god-mode-bootstrap"],
        });
        // A foreign server is never overwritten.
        expect(config.mcp_servers.clawlink).toMatchObject({
            url: "https://claw-link.dev/api/mcp",
        });
        // Ours carry the hosted URL and the bearer key.
        expect(config.mcp_servers.pollinations).toEqual({
            enabled: true,
            url: `${BASE_URL}/mcp/pollinations`,
            headers: { Authorization: "Bearer sk-test" },
        });
    });

    it("reports and removes only its own servers", async () => {
        await hermes()?.install(ctx, SERVERS, "sk-test");
        expect(hermes()?.status(ctx).installed.sort()).toEqual([
            "ffmpeg",
            "pollinations",
        ]);

        const result = await hermes()?.remove(ctx);
        expect(result?.removed?.sort()).toEqual(["ffmpeg", "pollinations"]);
        // The table disappears entirely when nothing is left in it.
        expect(read().mcp_servers).toBeUndefined();
    });

    it("recovers the key it previously wrote", async () => {
        await hermes()?.install(ctx, [SERVERS[0]], "sk-previous");
        expect(hermes()?.existingKey?.(ctx)).toBe("sk-previous");
    });
});
