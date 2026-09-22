import { env } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { communityModelId } from "@shared/community-endpoints.ts";
import { modelSequenceModelId } from "@shared/model-sequences.ts";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveModelDefinition } from "../src/middleware/model.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";

const db = drizzle(env.DB, { schema });

const PRIMARY = "openai/gpt-5.4";
const FALLBACK = "openai/gpt-5.4-nano";
const PAID_ONLY_MODEL = "mistralai/mistral-small-3.2";
const IMAGE_MODEL = "tongyi-mai/z-image-turbo";

let githubIdCounter = 900_000_000;
let ownerCounter = 0;

async function createSequenceOwner() {
    githubIdCounter += 1;
    ownerCounter += 1;
    const githubUsername = `seq-owner-${ownerCounter}`;
    const userId = await createTestUser({
        githubId: githubIdCounter,
        githubUsername,
    });
    return { userId, githubUsername };
}

async function insertSequence(
    ownerUserId: string,
    name: string,
    modelIds: string[],
    title = "Test Sequence",
    description: string | null = null,
) {
    const id = `seq-${crypto.randomUUID()}`;
    await db.insert(schema.modelSequence).values({
        id,
        ownerUserId,
        name,
        title,
        description,
        modelIds,
    });
    return id;
}

beforeEach(async () => {
    await resetGenerationModelRegistryCache(env);
});

// A D1 binding that fails the way schema skew fails: the statement prepares,
// then errors on execution. Mirrors model-registry.test.ts.
function skewedDbBinding(): CloudflareBindings["DB"] {
    const fail = () => {
        throw new Error("D1_ERROR: no such column: agent.config");
    };
    const statement = {
        bind: () => statement,
        all: fail,
        run: fail,
        first: fail,
        raw: fail,
    };
    return {
        prepare: () => statement,
        batch: fail,
        dump: fail,
        exec: fail,
        withSession: () => {
            throw new Error("unused");
        },
    } as unknown as CloudflareBindings["DB"];
}

describe("model sequence registry projection", () => {
    it("projects sequences served from the KV cache (dates revived)", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "kv-chain", [PRIMARY, FALLBACK]);
        const modelId = modelSequenceModelId(githubUsername, "kv-chain");

        // First load seeds the sequence KV cache (createdAt serializes to a
        // string in JSON); a skewed DB binding then forces the KV path.
        const seeded = await getGenerationModelRegistry(env);
        expect(seeded.resolve(modelId)).not.toBeNull();

        const fromKv = await getGenerationModelRegistry({
            ...env,
            DB: skewedDbBinding(),
        });
        const entry = fromKv.resolve(modelId);
        expect(entry).not.toBeNull();
        // row.createdAt.getTime() runs during projection: a stringified date
        // would throw here instead of yielding a timestamp.
        expect(Number.isFinite(entry?.definition.addedDate)).toBe(true);
    });

    it("projects a sequence as a virtual model cloned from its primary", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(
            userId,
            "reliable-chat",
            [PRIMARY, FALLBACK],
            "Reliable Chat",
            "Falls back to nano",
        );

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "reliable-chat"),
        );
        expect(entry).not.toBeNull();
        expect(entry?.modelSequence).toEqual({ ownerUserId: userId });
        // The primary supplies price, balance class, event type and
        // endpoints; the sequence overrides identity only.
        expect(entry?.eventType).toBe("generate.text");
        const primary = registry.resolve(PRIMARY);
        expect(entry?.definition.cost).toEqual(primary?.definition.cost);
        expect(entry?.definition.priceMultiplier).toBe(
            primary?.definition.priceMultiplier,
        );
        expect(entry?.definition.title).toBe("Reliable Chat");
        expect(entry?.definition.description).toBe("Falls back to nano");
        expect(entry?.definition.fallbacks).toEqual([FALLBACK]);
        expect(entry?.definition.aliases).toEqual([]);
        // Owner-private: the catalog adds it back for the owner only.
        expect(entry?.visible).toBe(false);
    });

    it("links fallback targets in declared order, depth one, marked sequenceTarget", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "chain", [PRIMARY, FALLBACK]);

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "chain"),
        );
        expect(entry?.fallbackEntries?.map((target) => target.id)).toEqual([
            FALLBACK,
        ]);
        const target = entry?.fallbackEntries?.[0];
        expect(target?.sequenceTarget).toBe(true);
        // A fallback's own fallbacks are never followed: routing stays
        // depth one.
        expect(target?.fallbackEntries).toBeUndefined();
    });

    it("lists the sequence only for its owner in the visible catalog", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        const { userId: otherUserId } = await createSequenceOwner();
        await insertSequence(userId, "mine", [PRIMARY, FALLBACK]);
        const modelId = modelSequenceModelId(githubUsername, "mine");

        const registry = await getGenerationModelRegistry(env);
        expect(
            registry.visibleEntries(userId).some((e) => e.id === modelId),
        ).toBe(true);
        expect(
            registry.visibleEntries(otherUserId).some((e) => e.id === modelId),
        ).toBe(false);
        expect(registry.visibleEntries().some((e) => e.id === modelId)).toBe(
            false,
        );
    });

    it("rejects non-owner resolution with the same invalid-model response as an unknown name", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        const { userId: otherUserId } = await createSequenceOwner();
        await insertSequence(userId, "private-chain", [PRIMARY, FALLBACK]);
        const modelId = modelSequenceModelId(githubUsername, "private-chain");

        await expect(
            resolveModelDefinition(modelId, "generate.text", env, otherUserId),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            resolveModelDefinition(modelId, "generate.text", env),
        ).rejects.toMatchObject({ status: 400 });
        const resolved = await resolveModelDefinition(
            modelId,
            "generate.text",
            env,
            userId,
        );
        expect(resolved.resolved).toBe(modelId);
    });

    it("disables the sequence when its primary model is gone", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "broken", ["no/such-model", FALLBACK]);

        const registry = await getGenerationModelRegistry(env);
        expect(
            registry.resolve(modelSequenceModelId(githubUsername, "broken")),
        ).toBeNull();
    });

    it("keeps the community primary's runtime so the first attempt can serve it", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        // A public proxy listing owned by the sequence owner, written the way
        // Enter writes proxy rows (variant fields packed into payload).
        await db.insert(schema.communityEndpoint).values({
            id: `seq-primary-endpoint-${ownerCounter}`,
            ownerUserId: userId,
            name: "pro",
            title: "pro",
            type: "proxy",
            visibility: "public",
            baseUrl: "https://api.example.com/v1/chat/completions",
            upstreamModel: "upstream-pro",
            payload: JSON.stringify({
                bearerTokenCiphertext: "test-ciphertext",
                api: "chat_completions",
                paidOnly: false,
                modality: "text",
                imagePricing: "request",
                inputModalities: ["text"],
                perUserRpm: null,
                fallbacks: [],
                prices: {},
            }),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const communityPrimaryId = communityModelId(githubUsername, "pro");
        await insertSequence(userId, "community-chain", [
            communityPrimaryId,
            FALLBACK,
        ]);

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "community-chain"),
        );
        expect(entry).not.toBeNull();
        // Without the runtime the first fallback candidate would take the
        // static-provider path with an id the gateway does not know, and the
        // primary could never serve.
        expect(entry?.communityEndpoint?.upstreamModel).toBe("upstream-pro");
        // The fallback band still links concrete targets, depth one.
        expect(entry?.fallbackEntries?.map((target) => target.id)).toEqual([
            FALLBACK,
        ]);
    });

    it("drops fallbacks priced above the primary", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        // nano is cheaper than gpt-5.4, so gpt-5.4 cannot fall back from it.
        await insertSequence(userId, "uphill", [FALLBACK, PRIMARY]);

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "uphill"),
        );
        expect(entry).not.toBeNull();
        expect(entry?.fallbackEntries).toBeUndefined();
    });

    it("drops paid-only fallbacks under a non-paid primary", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "paid-fallback", [
            PRIMARY,
            PAID_ONLY_MODEL,
        ]);

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "paid-fallback"),
        );
        expect(entry).not.toBeNull();
        expect(entry?.fallbackEntries).toBeUndefined();
    });

    it("never nests a sequence as a fallback target", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "inner", [PRIMARY, FALLBACK]);
        const innerId = modelSequenceModelId(githubUsername, "inner");
        await insertSequence(userId, "outer", [PRIMARY, innerId]);

        const registry = await getGenerationModelRegistry(env);
        const outer = registry.resolve(
            modelSequenceModelId(githubUsername, "outer"),
        );
        expect(outer).not.toBeNull();
        expect(
            outer?.fallbackEntries?.some(
                (target) => target.modelSequence !== undefined,
            ) ?? false,
        ).toBe(false);
    });

    it("drops fallbacks with a different event type", async () => {
        const { userId, githubUsername } = await createSequenceOwner();
        await insertSequence(userId, "mixed", [PRIMARY, IMAGE_MODEL]);

        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(
            modelSequenceModelId(githubUsername, "mixed"),
        );
        expect(entry).not.toBeNull();
        expect(entry?.fallbackEntries).toBeUndefined();
    });
});
