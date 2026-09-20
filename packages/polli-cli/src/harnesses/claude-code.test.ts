import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type PollinationsProvider,
    setProfileModel,
    stripProvider,
    upsertProvider,
} from "./claude-code.js";

const tmpHomes: string[] = [];

const makeCtx = () => {
    const home = mkdtempSync(join(tmpdir(), "polli-claude-"));
    tmpHomes.push(home);
    return {
        home,
        env: {
            ...process.env,
            APPDATA: join(home, "AppData", "Roaming"),
        } as NodeJS.ProcessEnv,
    };
};

const MODEL = {
    id: "openai/gpt-5.4-nano",
    contextWindow: 131072,
    input: ["text"],
};

const ccrDir = (ctx: ReturnType<typeof makeCtx>) =>
    join(ctx.env.APPDATA as string, "claude-code-router");

/** Seed a Claude Code Router config database the way the app does. */
const seedDb = (ctx: ReturnType<typeof makeCtx>, doc: unknown) => {
    const dir = ccrDir(ctx);
    mkdirSync(dir, { recursive: true });
    const dbFile = join(dir, "config.sqlite");
    const db = new DatabaseSync(dbFile);
    db.exec(
        "CREATE TABLE IF NOT EXISTS app_config (" +
            "key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    db.prepare(
        "INSERT INTO app_config (key, value_json, updated_at) VALUES ('default', ?, '2026-09-19T00:00:00Z')",
    ).run(JSON.stringify(doc));
    db.close();
    return dbFile;
};

const readRow = (dbFile: string): string => {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
        const row = db
            .prepare(
                "SELECT value_json FROM app_config WHERE key = 'default' LIMIT 1",
            )
            .get() as { value_json: string } | undefined;
        return row?.value_json ?? "";
    } finally {
        db.close();
    }
};

afterEach(() => {
    for (const home of tmpHomes.splice(0)) {
        rmSync(home, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
});

describe("provider upsert", () => {
    it("adds the pollinations provider", () => {
        const provider: PollinationsProvider = {
            name: "pollinations",
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_test",
            models: [MODEL.id],
            enabled: true,
        };
        const { config, changed } = upsertProvider(
            { Providers: [{ name: "deepseek", api_key: "sk_user" }] },
            provider,
        );
        expect(changed).toBe(true);
        expect(config.Providers).toHaveLength(2);
        expect(config.Providers?.[0]?.name).toBe("deepseek");
    });

    it("is idempotent and rotates the key in place", () => {
        const provider: PollinationsProvider = {
            name: "pollinations",
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_test",
            models: [MODEL.id],
            enabled: true,
        };
        const first = upsertProvider({}, provider);
        const second = upsertProvider(first.config, provider);
        expect(second.changed).toBe(false);
        const rotated = upsertProvider(first.config, {
            ...provider,
            api_key: "sk_new",
        });
        expect(rotated.changed).toBe(true);
        expect(rotated.config.Providers?.[0]).toMatchObject({
            api_key: "sk_new",
        });
    });
});

describe("agent profile model selection", () => {
    it("points profile.claudeCode at pollinations and enables it", () => {
        const { config, changed } = setProfileModel({}, MODEL.id);
        expect(changed).toBe(true);
        expect(config.profile?.claudeCode).toMatchObject({
            enabled: true,
            model: `pollinations,${MODEL.id}`,
        });
    });

    it("follows our earlier slots but never user-owned ones", () => {
        // A slot we set in an earlier `on` follows the new model…
        const first = setProfileModel({}, MODEL.id);
        (
            first.config.profile?.claudeCode as Record<string, unknown>
        ).haikuModel = `pollinations,${MODEL.id}`;
        const second = setProfileModel(first.config, "openai/gpt-5.4");
        const claudeCode = second.config.profile?.claudeCode as Record<
            string,
            unknown
        >;
        expect(claudeCode.model).toBe("pollinations,openai/gpt-5.4");
        expect(claudeCode.haikuModel).toBe("pollinations,openai/gpt-5.4");

        const userOwned = setProfileModel(
            {
                profile: {
                    claudeCode: { haikuModel: "deepseek,deepseek-chat" },
                },
            },
            MODEL.id,
        );
        const kept = userOwned.config.profile?.claudeCode as Record<
            string,
            unknown
        >;
        expect(kept.haikuModel).toBe("deepseek,deepseek-chat");
    });
});

describe("surgical strip", () => {
    it("removes our provider and model slots, keeps everything else", () => {
        const withUser = {
            Providers: [
                {
                    name: "deepseek",
                    api_key: "sk_user",
                    models: ["deepseek-chat"],
                },
                {
                    name: "pollinations",
                    api_key: "sk_test",
                    models: [MODEL.id],
                    enabled: true,
                },
            ],
            profile: {
                claudeCode: {
                    enabled: true,
                    model: `pollinations,${MODEL.id}`,
                    haikuModel: "deepseek,deepseek-chat",
                },
            },
        };
        const { config, changed } = stripProvider(withUser);
        expect(changed).toBe(true);
        expect(config.Providers).toHaveLength(1);
        expect(config.Providers?.[0]?.name).toBe("deepseek");
        const claudeCode = config.profile?.claudeCode as Record<
            string,
            unknown
        >;
        expect(claudeCode.model).toBeUndefined();
        expect(claudeCode.enabled).toBeUndefined();
        expect(claudeCode.haikuModel).toBe("deepseek,deepseek-chat");
    });

    it("reports unchanged when nothing of ours is present", () => {
        const { changed } = stripProvider({
            Providers: [{ name: "deepseek", api_key: "sk_user" }],
        });
        expect(changed).toBe(false);
    });
});

describe("on/off lifecycle", () => {
    it("writes the row, reuses the key, restores byte-for-byte on off", async () => {
        const ctx = makeCtx();
        const userDoc = {
            Providers: [
                {
                    name: "deepseek",
                    api_key: "sk_user",
                    models: ["deepseek-chat"],
                },
            ],
            Router: { rules: [] },
            profile: { claudeCode: { enabled: false } },
        };
        const dbFile = seedDb(ctx, userDoc);

        const { claudeCode } = await import("./claude-code.js");
        const keySpy = vi
            .spyOn(await import("./keys.js"), "resolveHarnessKey")
            .mockResolvedValue("sk_test_claude_key");
        vi.spyOn(await import("./smoke.js"), "smokeChat").mockResolvedValue({
            ok: true,
            detail: "pong",
        });

        const on = await claudeCode.on(ctx, { model: MODEL.id });
        expect(on.configured).toBe(true);
        expect(on.model).toBe(MODEL.id);
        expect(keySpy).toHaveBeenCalledTimes(1);

        const afterOn = readRow(dbFile);
        const parsed = JSON.parse(afterOn);
        expect(parsed.Providers).toHaveLength(2);
        expect(parsed.profile.claudeCode.model).toBe(
            `pollinations,${MODEL.id}`,
        );
        expect(JSON.stringify(parsed)).toContain("sk_test_claude_key");

        // Key reuse on a second run.
        await claudeCode.on(ctx, { model: MODEL.id });
        expect(keySpy).toHaveBeenCalledTimes(2);
        expect(keySpy.mock.calls[1][0].existingKey).toBe("sk_test_claude_key");

        // The original user provider survives untouched.
        expect(parsed.Providers[0]).toEqual(userDoc.Providers[0]);

        const off = await claudeCode.off(ctx);
        expect(off.outcome).toBe("restored");
        expect(readRow(dbFile)).toBe(JSON.stringify(userDoc));

        const status = await claudeCode.status(ctx);
        expect(status.configured).toBe(false);
    });

    it("strips surgically after outside edits", async () => {
        const ctx = makeCtx();
        const dbFile = seedDb(ctx, {
            Providers: [
                { name: "deepseek", api_key: "sk_user", models: ["x"] },
            ],
        });

        const { claudeCode } = await import("./claude-code.js");
        vi.spyOn(
            await import("./keys.js"),
            "resolveHarnessKey",
        ).mockResolvedValue("sk_test");
        vi.spyOn(await import("./smoke.js"), "smokeChat").mockResolvedValue({
            ok: true,
            detail: "pong",
        });

        await claudeCode.on(ctx, { model: MODEL.id });

        // A third-party tool edits the row after our `on`.
        const edited = JSON.parse(readRow(dbFile));
        edited.Providers.push({
            name: "kimi",
            api_key: "sk_kimi",
            models: ["k2"],
        });
        writeFileSync(dbFile, readFileSync(dbFile)); // touch, keep sqlite valid
        const db = new DatabaseSync(dbFile);
        db.prepare(
            "UPDATE app_config SET value_json = ? WHERE key = 'default'",
        ).run(JSON.stringify(edited));
        db.close();

        const off = await claudeCode.off(ctx);
        expect(off.outcome).toBe("stripped");

        const after = JSON.parse(readRow(dbFile));
        expect(
            after.Providers.map((p: { name: string }) => p.name).sort(),
        ).toEqual(["deepseek", "kimi"]);
    });

    it("status never creates the database", async () => {
        const ctx = makeCtx();
        const { claudeCode } = await import("./claude-code.js");
        const status = await claudeCode.status(ctx);
        expect(status.configured).toBe(false);
        expect(existsSync(join(ccrDir(ctx), "config.sqlite"))).toBe(false);
    });

    it("stops before login when the router database is missing", async () => {
        const ctx = makeCtx();
        const { claudeCode } = await import("./claude-code.js");
        const keySpy = vi.spyOn(await import("./keys.js"), "resolveHarnessKey");
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            /config database not found/,
        );
        expect(keySpy).not.toHaveBeenCalled();
    });
});
