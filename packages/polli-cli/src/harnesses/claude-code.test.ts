import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    claudeCode,
    configureClaudeCodeConfig,
    stripClaudeCodeConfig,
} from "./claude-code.js";
import type { HarnessContext, HarnessModel } from "./types.js";

type Journal = NonNullable<Parameters<typeof stripClaudeCodeConfig>[1]>;

const models: HarnessModel[] = [
    {
        id: "deepseek/deepseek-v4-flash",
        contextWindow: 64_000,
        input: ["text", "image"],
    },
    { id: "openai/gpt-5.4-nano", contextWindow: 128_000, input: ["text"] },
];

const baseConfig = () => ({
    Providers: [{ id: "mine", name: "Mine", models: ["mine/model"] }],
    APIKEYS: [],
    profile: {
        enabled: false,
        profiles: [
            {
                id: "mine-profile",
                name: "Mine",
                agent: "claude-code",
                enabled: true,
                model: "Mine/model",
            },
        ],
    },
    routerEndpoint: "http://127.0.0.1:3456",
});

const digest = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");

const journalFor = (
    update: ReturnType<typeof configureClaudeCodeConfig>,
): Journal => ({
    version: 1,
    providerHash: digest(update.provider),
    profileHash: digest(update.profile),
    profileEnabledBefore: false,
    profileEnabledAfter: true,
});

describe("claude code router harness", () => {
    let home: string;
    let ctx: HarnessContext;

    beforeEach(async () => {
        home = await mkdtemp(join(tmpdir(), "polli-claude-code-"));
        ctx = { home, env: { PATH: "" } };
    });

    afterEach(async () => {
        await rm(home, { recursive: true, force: true });
    });

    it("adds a live model catalog and isolated CCR profile", () => {
        const update = configureClaudeCodeConfig(
            baseConfig(),
            models,
            "sk_test_claude",
            models[0].id,
        );

        expect(update.config.Providers).toEqual([
            expect.objectContaining({ id: "mine" }),
            expect.objectContaining({
                id: "pollinations",
                name: "Pollinations.ai",
                type: "openai_chat_completions",
                api_base_url: "https://gen.pollinations.ai/v1",
                api_key: "sk_test_claude",
                models: models.map((model) => model.id),
            }),
        ]);
        expect(
            (update.config.profile as { profiles: unknown[] }).profiles,
        ).toContainEqual(
            expect.objectContaining({
                id: "pollinations-claude-code",
                scope: "ccr",
                model: `Pollinations.ai/${models[0].id}`,
                availableModels: models.map(
                    (model) => `Pollinations.ai/${model.id}`,
                ),
            }),
        );
        expect((update.config.profile as { enabled: boolean }).enabled).toBe(true);
    });

    it("refuses provider and profile id collisions without an ownership journal", () => {
        const providerCollision = baseConfig();
        providerCollision.Providers.push({
            id: "pollinations",
            name: "User provider",
            models: [],
        });
        expect(() =>
            configureClaudeCodeConfig(
                providerCollision,
                models,
                "sk_test",
                models[0].id,
            ),
        ).toThrow(/user-owned or edited provider/u);

        const profileCollision = baseConfig();
        profileCollision.profile.profiles.push({
            id: "pollinations-claude-code",
            name: "User profile",
            agent: "claude-code",
            enabled: true,
            model: "Mine/model",
        });
        expect(() =>
            configureClaudeCodeConfig(
                profileCollision,
                models,
                "sk_test",
                models[0].id,
            ),
        ).toThrow(/user-owned or edited profile/u);
    });

    it("allows a rerun only while the owned entries are untouched", () => {
        const first = configureClaudeCodeConfig(
            baseConfig(),
            models,
            "sk_reused",
            models[0].id,
        );
        const journal = journalFor(first);
        const rerun = configureClaudeCodeConfig(
            first.config,
            models,
            "sk_reused",
            models[1].id,
            journal,
        );
        expect(rerun.profile.model).toBe(`Pollinations.ai/${models[1].id}`);

        first.profile.model = "Pollinations.ai/user-edit";
        expect(() =>
            configureClaudeCodeConfig(
                first.config,
                models,
                "sk_reused",
                models[1].id,
                journal,
            ),
        ).toThrow(/user-owned or edited/u);
    });

    it("restores the prior profile state when owned entries are untouched", () => {
        const original = baseConfig();
        const update = configureClaudeCodeConfig(
            original,
            models,
            "sk_test",
            models[0].id,
        );
        const stripped = stripClaudeCodeConfig(update.config, journalFor(update));

        expect(stripped.outcome).toBe("restored");
        expect(stripped.config).toEqual(original);
    });

    it("surgically removes owned ids while preserving later user changes", () => {
        const update = configureClaudeCodeConfig(
            baseConfig(),
            models,
            "sk_test",
            models[0].id,
        );
        const journal = journalFor(update);
        (update.config.Providers as Array<Record<string, unknown>>).push({
            id: "added-later",
        });
        (update.config.profile as { enabled: boolean }).enabled = false;
        update.provider.models = ["user-edited-model"];

        const stripped = stripClaudeCodeConfig(update.config, journal);

        expect(stripped.outcome).toBe("stripped");
        expect(stripped.config.Providers).toEqual([
            expect.objectContaining({ id: "mine" }),
            { id: "added-later" },
        ]);
        expect((stripped.config.profile as { enabled: boolean }).enabled).toBe(
            false,
        );
    });

    it("does nothing without proof of ownership", () => {
        const current = baseConfig();
        const stripped = stripClaudeCodeConfig(current, null);
        expect(stripped).toEqual({ config: current, changed: false });
    });

    it("stops before starting CCR or logging in when the router is missing", async () => {
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(/was not found/u);
    });
});
