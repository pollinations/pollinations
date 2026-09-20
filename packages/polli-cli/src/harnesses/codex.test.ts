import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codex, configureCodexRouter, disableCodexRouter } from "./codex.js";
import type { HarnessContext, HarnessModel } from "./types.js";

const models: HarnessModel[] = [
    { id: "openai/gpt-5.4-nano", contextWindow: 128_000, input: ["text"] },
    {
        id: "deepseek/deepseek-v4-flash",
        contextWindow: 64_000,
        input: ["text", "image"],
    },
];

describe("codex router harness", () => {
    let home: string;
    let ctx: HarnessContext;
    let state: string;

    beforeEach(async () => {
        home = await mkdtemp(join(tmpdir(), "polli-codex-"));
        state = join(home, ".codex", "codex-router");
        ctx = { home, env: { PATH: "", CODEX_HOME: join(home, ".codex") } };
    });

    afterEach(async () => {
        await rm(home, { recursive: true, force: true });
    });

    const readJson = (file: string) =>
        JSON.parse(readFileSync(join(state, file), "utf-8"));

    it("writes current protected router state without copying the key to snapshots", () => {
        configureCodexRouter(ctx, models, "sk_test_codex", models[0].id);

        expect(readJson("generic-providers.json").providers).toContainEqual(
            expect.objectContaining({
                id: "pollinations",
                adapter: "openai-chat",
                baseUrl: "https://gen.pollinations.ai/v1",
            }),
        );
        expect(
            readJson("provider-credentials.json").credentials,
        ).toContainEqual(
            expect.objectContaining({
                id: "cred_pollinations_harness_codex",
                secretRef: expect.objectContaining({ type: "provider-file" }),
            }),
        );
        expect(readJson("user-models.json").models[0]).toMatchObject({
            upstreamModel: models[0].id,
            priority: 100,
        });
        expect(
            readFileSync(
                join(state, "generic-provider-credentials", "pollinations.key"),
                "utf-8",
            ).trim(),
        ).toBe("sk_test_codex");
        const snapshotDir = join(home, ".pollinations", "harnesses");
        const snapshot = readdirSync(snapshotDir).find((file) =>
            file.startsWith("codex."),
        );
        expect(snapshot).toBeDefined();
        const snapshots = readFileSync(
            join(snapshotDir, snapshot as string),
            "utf-8",
        );
        expect(snapshots).not.toContain("sk_test_codex");
    });

    it("preserves unrelated entries and restores original files byte-for-byte", () => {
        mkdirSync(state, { recursive: true });
        const original = '{"version":1,"providers":[{"id":"mine"}]}\n';
        writeFileSync(join(state, "generic-providers.json"), original);

        configureCodexRouter(ctx, models, "sk_test", models[0].id);
        expect(readJson("generic-providers.json").providers[0]).toEqual({
            id: "mine",
        });
        const result = disableCodexRouter(ctx);

        expect(result.outcome).toBe("restored");
        expect(
            readFileSync(join(state, "generic-providers.json"), "utf-8"),
        ).toBe(original);
        expect(
            existsSync(
                join(state, "generic-provider-credentials", "pollinations.key"),
            ),
        ).toBe(false);
    });

    it("surgically removes owned entries after an external edit", () => {
        configureCodexRouter(ctx, models, "sk_test", models[0].id);
        const providers = readJson("generic-providers.json");
        providers.providers.push({ id: "added-later" });
        writeFileSync(
            join(state, "generic-providers.json"),
            `${JSON.stringify(providers)}\n`,
        );

        const result = disableCodexRouter(ctx);

        expect(result.outcome).toBe("stripped");
        expect(readJson("generic-providers.json").providers).toEqual([
            { id: "added-later" },
        ]);
    });

    it("refuses a user-owned provider collision", () => {
        mkdirSync(state, { recursive: true });
        writeFileSync(
            join(state, "generic-providers.json"),
            JSON.stringify({ version: 1, providers: [{ id: "pollinations" }] }),
        );

        expect(() =>
            configureCodexRouter(ctx, models, "sk_test", models[0].id),
        ).toThrow(/user-owned provider/u);
    });

    it("does not remove an unowned provider key on off", () => {
        const keyFile = join(
            state,
            "generic-provider-credentials",
            "pollinations.key",
        );
        mkdirSync(join(state, "generic-provider-credentials"), {
            recursive: true,
        });
        writeFileSync(keyFile, "user-key\n");

        expect(disableCodexRouter(ctx).outcome).toBe("unchanged");
        expect(readFileSync(keyFile, "utf-8")).toBe("user-key\n");
        expect(() =>
            configureCodexRouter(ctx, models, "sk_test", models[0].id),
        ).toThrow(/user-owned key file/u);
    });

    it("reuses the original snapshot while switching the selected model", () => {
        configureCodexRouter(ctx, models, "sk_first", models[0].id);
        configureCodexRouter(ctx, models, "sk_first", models[1].id);

        expect(readJson("user-models.json").models[0].upstreamModel).toBe(
            models[1].id,
        );
        expect(disableCodexRouter(ctx).outcome).toBe("restored");
        expect(existsSync(join(state, "user-models.json"))).toBe(false);
    });

    it("rolls back and leaves no key when existing metadata is invalid", () => {
        mkdirSync(state, { recursive: true });
        writeFileSync(join(state, "generic-providers.json"), "[]\n");

        expect(() =>
            configureCodexRouter(ctx, models, "sk_test", models[0].id),
        ).toThrow(/JSON object/u);
        expect(
            existsSync(
                join(state, "generic-provider-credentials", "pollinations.key"),
            ),
        ).toBe(false);
        expect(
            readFileSync(join(state, "generic-providers.json"), "utf-8"),
        ).toBe("[]\n");
    });

    it("stops before setup or login when codex-router is missing", async () => {
        await expect(codex.on(ctx, {})).rejects.toThrow(/was not found/u);
        expect(existsSync(state)).toBe(false);
    });
});
