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
            model: "openai/gpt-5.4-nano",
        });
        expect(parseEnv(read())).toMatchObject({
            AI_PROVIDER: "pollinations",
            POLLINATIONS_API_KEY: "sk_test_key",
            POLLINATIONS_MODEL: "openai/gpt-5.4-nano",
        });
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
    });

    it("preserves unrelated configuration and replaces managed values", () => {
        mkdirSync(join(home, ".config", "tgpt"), { recursive: true });
        writeFileSync(
            configFile(),
            "OTHER_KEY=keep\nAI_PROVIDER=groq\nAI_API_KEY=old-provider-key\nPOLLINATIONS_API_KEY=older-pollinations-key\nPOLLINATIONS_MODEL=old\n",
        );
        configureTgpt(ctx, "sk_test_key", "deepseek");
        expect(parseEnv(read())).toMatchObject({
            OTHER_KEY: "keep",
            AI_PROVIDER: "pollinations",
            POLLINATIONS_API_KEY: "sk_test_key",
            POLLINATIONS_MODEL: "deepseek",
        });
        expect(parseEnv(read()).AI_API_KEY).toBeUndefined();
    });

    it("restores the original file on off", () => {
        mkdirSync(join(home, ".config", "tgpt"), { recursive: true });
        const original =
            "AI_PROVIDER=groq\nAI_API_KEY=old-provider-key\nOTHER_KEY=keep\n";
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

    it("keeps a different provider selected after on", () => {
        configureTgpt(ctx, "sk_test_key");
        writeFileSync(
            configFile(),
            read().replace(
                'AI_PROVIDER="pollinations"',
                'AI_PROVIDER="ollama"',
            ),
        );
        expect(disableTgpt(ctx).outcome).toBe("stripped");
        expect(parseEnv(read())).toEqual({ AI_PROVIDER: "ollama" });
    });
});
