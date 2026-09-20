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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildCredentialEntry,
    buildGenericProvider,
    buildUserModelEntry,
    isRouterWired,
    stripUserModels,
    upsertCredentialEntry,
    upsertGenericProvider,
    upsertUserModel,
} from "./codex.js";

const tmpHomes: string[] = [];

const makeCtx = () => {
    const home = mkdtempSync(join(tmpdir(), "polli-codex-"));
    tmpHomes.push(home);
    // PATH comes from the real environment so commandExists can see codex;
    // the router checkout lives inside the temp home via the documented
    // CODEX_ROUTER_HOME-style override path resolution.
    return {
        home,
        env: {
            ...process.env,
            CODEX_ROUTER_HOME: join(home, "AppData", "Local", "codex-router"),
        } as NodeJS.ProcessEnv,
    };
};

afterEach(() => {
    for (const home of tmpHomes.splice(0)) {
        rmSync(home, { recursive: true, force: true });
    }
    vi.unstubAllGlobals();
});

const MODEL = {
    id: "openai/gpt-5.4-nano",
    contextWindow: 131072,
    input: ["text"],
};

describe("generic provider document", () => {
    it("adds the pollinations provider with a credential reference", () => {
        const { doc } = upsertGenericProvider(
            null,
            buildGenericProvider("cred_pollinations"),
        );
        expect(doc.version).toBe(1);
        expect(doc.providers).toHaveLength(1);
        expect(doc.providers[0]).toMatchObject({
            id: "pollinations",
            displayName: "Pollinations",
            baseUrl: "https://gen.pollinations.ai/v1",
            adapter: "openai-chat",
            credentialRef: "cred_pollinations",
            enabled: true,
        });
    });

    it("is idempotent", () => {
        const first = upsertGenericProvider(
            null,
            buildGenericProvider("cred_pollinations"),
        );
        const second = upsertGenericProvider(
            first.doc,
            buildGenericProvider("cred_pollinations"),
        );
        expect(second.changed).toBe(false);
    });

    it("keeps user-tuned description and an existing credentialRef on update", () => {
        const first = upsertGenericProvider(
            null,
            buildGenericProvider("cred_pollinations"),
        );
        const tuned = {
            ...buildGenericProvider("cred_pollinations"),
            description: "my own description",
        };
        (first.doc.providers[0] as Record<string, unknown>).description =
            "my own description";
        const second = upsertGenericProvider(
            first.doc,
            buildGenericProvider("cred_other"),
        );
        expect(
            (second.doc.providers[0] as Record<string, unknown>).description,
        ).toBe("my own description");
        expect(
            (second.doc.providers[0] as Record<string, unknown>).credentialRef,
        ).toBe("cred_other");
        expect(tuned).toBeTruthy();
    });
});

describe("credential store entry", () => {
    it("uses the generic provider-file secretRef and no inline secret", () => {
        const entry = buildCredentialEntry("codex", "2026-09-20T00:00:00Z");
        expect(entry).toMatchObject({
            id: "cred_pollinations",
            providerId: "pollinations",
            providerType: "generic",
            kind: "api_key",
            state: "active",
        });
        expect(entry.secretRef).toEqual({
            type: "provider-file",
            providerId: "pollinations",
            target: "codex",
        });
        expect(JSON.stringify(entry)).not.toContain("sk_");
    });

    it("preserves createdAt on key rotation", () => {
        const first = buildCredentialEntry("codex", "2026-09-20T00:00:00Z");
        const { doc } = upsertCredentialEntry(null, first);
        const rotated = buildCredentialEntry("codex", "2026-09-21T00:00:00Z");
        const { doc: next, changed } = upsertCredentialEntry(doc, rotated);
        expect(changed).toBe(true);
        expect((next.credentials[0] as Record<string, unknown>).createdAt).toBe(
            "2026-09-20T00:00:00Z",
        );
    });
});

describe("user models", () => {
    it("carries the slug/gateway identity codex-router derives", () => {
        const entry = buildUserModelEntry(MODEL, 100);
        expect(entry).toMatchObject({
            slug: "pollinations/openai/gpt-5.4-nano",
            gatewayModel: "pollinations-openai-gpt-5-4-nano",
            upstreamModel: "openai/gpt-5.4-nano",
            provider: "pollinations",
            listed: true,
        });
    });

    it("merges by provider+upstream without touching other providers", () => {
        const other = {
            slug: "kimi/k2",
            provider: "kimi",
            upstreamModel: "k2",
        };
        const first = upsertUserModel(
            { models: [other] },
            buildUserModelEntry(MODEL, 100),
        );
        expect(first.doc.models).toHaveLength(2);
        const updated = buildUserModelEntry(
            { ...MODEL, contextWindow: 200 },
            100,
        );
        const second = upsertUserModel(first.doc, updated);
        expect(second.doc.models).toHaveLength(2);
        expect(
            (second.doc.models[1] as Record<string, unknown>).contextWindow,
        ).toBe(200);
    });

    it("strips only pollinations entries", () => {
        const other = {
            slug: "kimi/k2",
            provider: "kimi",
            upstreamModel: "k2",
        };
        const ours = buildUserModelEntry(MODEL, 100);
        const { doc, changed } = stripUserModels({ models: [other, ours] });
        expect(changed).toBe(true);
        expect(doc?.models).toEqual([other]);
    });
});

describe("router wiring marker", () => {
    it("detects the managed blocks config-manager writes", () => {
        expect(
            isRouterWired(
                "# BEGIN codex-router-model_providers\nx\n# END codex-router-model_providers",
            ),
        ).toBe(true);
        expect(isRouterWired("# BEGIN kimi-codex-router-x")).toBe(true);
        expect(isRouterWired("# BEGIN something-else")).toBe(false);
        expect(isRouterWired(null)).toBe(false);
    });
});

describe("on/off lifecycle", () => {
    it("writes state, reuses the key, and restores byte-for-byte on off", async () => {
        const ctx = makeCtx();
        // Codex + router checkout exist; config already wired so client-setup is skipped.
        const { join: pjoin } = await import("node:path");
        mkdirSync(
            pjoin(
                ctx.home,
                ".codex",
                "codex-router",
                "generic-provider-credentials",
            ),
            { recursive: true },
        );
        mkdirSync(pjoin(ctx.home, "AppData", "Local", "codex-router", "src"), {
            recursive: true,
        });
        writeFileSync(
            pjoin(
                ctx.home,
                "AppData",
                "Local",
                "codex-router",
                "src",
                "control.mjs",
            ),
            "// router\n",
        );
        writeFileSync(
            pjoin(ctx.home, ".codex", "config.toml"),
            "# BEGIN codex-router-model_providers\n# END codex-router-model_providers\n",
        );

        const { codex } = await import("./codex.js");
        const keyModule = await import("./keys.js");
        const keySpy = vi
            .spyOn(keyModule, "resolveHarnessKey")
            .mockResolvedValue("sk_test_codex_key");
        const smokeModule = await import("./smoke.js");
        const _smokeSpy = vi
            .spyOn(smokeModule, "smokeChat")
            .mockResolvedValue({ ok: true, detail: "pong" });

        const on = await codex.on(ctx, { model: "openai/gpt-5.4-nano" });
        expect(on.configured).toBe(true);
        expect(on.model).toBe("openai/gpt-5.4-nano");
        expect(keySpy).toHaveBeenCalledTimes(1);

        // Key reuse on a second run.
        await codex.on(ctx, { model: "openai/gpt-5.4-nano" });
        expect(keySpy).toHaveBeenCalledTimes(2);
        expect(keySpy.mock.calls[1][0].existingKey).toBe("sk_test_codex_key");

        const keyFile = pjoin(
            ctx.home,
            ".codex",
            "codex-router",
            "generic-provider-credentials",
            "pollinations.key",
        );
        expect(readFileSync(keyFile, "utf8")).toBe("sk_test_codex_key\n");

        const off = await codex.off(ctx);
        // Nothing existed before our `on`, so byte-for-byte restore removes
        // every file we wrote.
        expect(off.outcome).toBe("restored");
        expect(
            existsSync(
                pjoin(
                    ctx.home,
                    ".codex",
                    "codex-router",
                    "provider-credentials.json",
                ),
            ),
        ).toBe(false);
        expect(existsSync(keyFile)).toBe(false);
        expect(
            existsSync(
                pjoin(
                    ctx.home,
                    ".codex",
                    "codex-router",
                    "generic-providers.json",
                ),
            ),
        ).toBe(false);

        const status = await codex.status(ctx);
        expect(status.configured).toBe(false);
    });

    it("strips surgically after outside edits instead of restoring", async () => {
        const ctx = makeCtx();
        const { join: pjoin } = await import("node:path");
        mkdirSync(
            pjoin(
                ctx.home,
                ".codex",
                "codex-router",
                "generic-provider-credentials",
            ),
            { recursive: true },
        );
        mkdirSync(pjoin(ctx.home, "AppData", "Local", "codex-router", "src"), {
            recursive: true,
        });
        writeFileSync(
            pjoin(
                ctx.home,
                "AppData",
                "Local",
                "codex-router",
                "src",
                "control.mjs",
            ),
            "// router\n",
        );
        writeFileSync(
            pjoin(ctx.home, ".codex", "config.toml"),
            "# BEGIN codex-router-x\n",
        );

        const { codex } = await import("./codex.js");
        vi.spyOn(
            await import("./keys.js"),
            "resolveHarnessKey",
        ).mockResolvedValue("sk_test");
        vi.spyOn(await import("./smoke.js"), "smokeChat").mockResolvedValue({
            ok: true,
            detail: "pong",
        });

        await codex.on(ctx, { model: "openai/gpt-5.4-nano" });

        // A third-party tool edits the shared user-models file after our `on`.
        const userModelsPath = pjoin(
            ctx.home,
            ".codex",
            "codex-router",
            "user-models.json",
        );
        const parsed = JSON.parse(readFileSync(userModelsPath, "utf8"));
        parsed.models.push({
            slug: "kimi/k2",
            provider: "kimi",
            upstreamModel: "k2",
        });
        writeFileSync(userModelsPath, JSON.stringify(parsed, null, 2));

        const off = await codex.off(ctx);
        expect(off.outcome).toBe("stripped");

        const after = JSON.parse(readFileSync(userModelsPath, "utf8"));
        expect(after.models).toEqual([
            { slug: "kimi/k2", provider: "kimi", upstreamModel: "k2" },
        ]);
        expect(
            JSON.parse(
                readFileSync(
                    pjoin(
                        ctx.home,
                        ".codex",
                        "codex-router",
                        "generic-providers.json",
                    ),
                    "utf8",
                ),
            ).providers,
        ).toEqual([]);
    });

    it("stops before login when the router is missing", async () => {
        const ctx = makeCtx();
        const { codex } = await import("./codex.js");
        const keySpy = vi.spyOn(await import("./keys.js"), "resolveHarnessKey");
        await expect(codex.on(ctx, {})).rejects.toThrow(
            /Codex Router was not found/,
        );
        expect(keySpy).not.toHaveBeenCalled();
    });
});
