import {
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
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureTgpt, disableTgpt, tgpt } from "./tgpt.js";
import type { HarnessContext } from "./types.js";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-tgpt-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".config", "tgpt", "config.conf");
const read = () => readFileSync(configFile(), "utf-8");

describe("tgpt harness", () => {
    it("configures authenticated Pollinations text requests", () => {
        expect(configureTgpt(ctx, "sk_test_key")).toMatchObject({
            harness: "tgpt",
            configured: true,
            model: "openai",
        });
        expect(parseEnv(read())).toMatchObject({
            AI_PROVIDER: "pollinations",
            POLLINATIONS_API_KEY: "sk_test_key",
            POLLINATIONS_MODEL: "openai",
        });
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
    });

    it("preserves unrelated configuration and replaces managed values", () => {
        mkdirSync(join(home, ".config", "tgpt"), { recursive: true });
        writeFileSync(
            configFile(),
            "OTHER_KEY=keep\nAI_PROVIDER=groq\nPOLLINATIONS_MODEL=old\n",
        );
        configureTgpt(ctx, "sk_test_key", "deepseek");
        expect(parseEnv(read())).toMatchObject({
            OTHER_KEY: "keep",
            AI_PROVIDER: "pollinations",
            POLLINATIONS_API_KEY: "sk_test_key",
            POLLINATIONS_MODEL: "deepseek",
        });
    });

    it("restores the original file on off", () => {
        mkdirSync(join(home, ".config", "tgpt"), { recursive: true });
        const original = "AI_PROVIDER=groq\nOTHER_KEY=keep\n";
        writeFileSync(configFile(), original);
        configureTgpt(ctx, "sk_test_key");
        expect(disableTgpt(ctx).outcome).toBe("restored");
        expect(read()).toBe(original);
    });

    it("removes only managed values when the file changed after on", () => {
        configureTgpt(ctx, "sk_test_key");
        writeFileSync(configFile(), `${read()}LATER=keep\n`);
        expect(disableTgpt(ctx).outcome).toBe("stripped");
        expect(read()).toBe("LATER=keep\n");
    });

    it("stops before configuration when tgpt is unavailable", async () => {
        await expect(tgpt.on(ctx, {})).rejects.toThrow("tgpt was not found");
        expect(existsSync(configFile())).toBe(false);
    });
});
