import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    getVisibleImageModels,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import { describe, expect, it, vi } from "vitest";
import {
    attachFallbackTarget,
    type FallbackAttempt,
    type FallbackCandidate,
    fallbackCandidates,
    formatFallbackTarget,
    isRetryableFallbackError,
    linkFallbackEntries,
    withModelFallback,
    withModelFallbackResponse,
} from "../src/fallback.ts";
import type { GenerationModelEntry } from "../src/model-registry.ts";

function registryEntry(
    id: string,
    fallbacks: string[] = [],
    rate = 1,
): GenerationModelEntry {
    const definition: ModelDefinition = {
        aliases: [],
        provider: "test",
        fallbacks,
        brand: "Test",
        category: "text",
        cost: { completionTextTokens: rate },
        priceMultiplier: 1,
        addedDate: 0,
        title: id,
    };
    return {
        id,
        aliases: [],
        eventType: "generate.text",
        supportedEndpoints: ["/v1/chat/completions"],
        definition,
        info: {} as GenerationModelEntry["info"],
        visible: true,
    };
}

function communityEntry(
    id: string,
    ownerUserId: string,
    visibility: "private" | "public" = "public",
    hiddenAt: number | null = null,
    fallbacks: string[] = [],
    rate = 10,
    paidOnly = false,
): GenerationModelEntry {
    const entry = registryEntry(id, fallbacks, rate);
    entry.visible = visibility === "public" && hiddenAt === null;
    entry.definition.hidden = hiddenAt !== null;
    entry.communityEndpoint = {
        type: "proxy",
        ownerUserId,
        visibility,
        hiddenAt,
        paidOnly,
        imagePricing: "request",
        fallbacks,
        ...communityEndpointPrices({
            promptTextPrice: rate,
            completionTextPrice: rate,
        }),
    } as GenerationModelEntry["communityEndpoint"];
    return entry;
}

describe("registry fallback linking", () => {
    it("marks provider routes as hidden, fallback-only registry entries", () => {
        expect(IMAGE_SERVICES.zimage.fallbacks).toContain("zimage-fal");
        expect(IMAGE_SERVICES["zimage-fal"]).toMatchObject({
            aliases: [],
            hidden: true,
            fallbackOnly: true,
            provider: "fal",
        });
        expect(getVisibleImageModels()).not.toContain("zimage-fal");
    });

    it("declares direct OpenAI fallbacks for every GPT Image model", () => {
        const pairs = [
            ["gptimage", "gptimage-openai"],
            ["gptimage-large", "gptimage-large-openai"],
            ["gpt-image-2", "gpt-image-2-openai"],
        ] as const;

        for (const [primary, fallback] of pairs) {
            expect(IMAGE_SERVICES[primary].fallbacks).toEqual([fallback]);
            expect(IMAGE_SERVICES[fallback]).toMatchObject({
                aliases: [],
                hidden: true,
                fallbackOnly: true,
                provider: "openai",
            });
            expect(getVisibleImageModels()).not.toContain(fallback);
        }
    });

    it("uses registry declarations without applying community price rules", () => {
        const primary = registryEntry("primary", ["target-alias", "target"]);
        const target = registryEntry("target", ["primary"], 10);
        target.aliases = ["target-alias"];
        target.visible = false;
        const entries = [primary, target];
        const byIdOrAlias = new Map<string, GenerationModelEntry>([
            [primary.id, primary],
            [target.id, target],
            [target.aliases[0], target],
        ]);

        linkFallbackEntries(entries, byIdOrAlias);

        // The target costs more than the primary and is hidden, but is still
        // linked: bundled fallbacks are maintained by us, while the caller keeps
        // the primary's quoted price. Alias duplication is collapsed and chains
        // stay depth 1.
        expect(primary.fallbackEntries?.map((entry) => entry.id)).toEqual([
            "target",
        ]);
        expect(primary.fallbackEntries?.[0].fallbackEntries).toBeUndefined();
        expect(
            fallbackCandidates({
                resolved: primary.id,
                definition: primary.definition,
                fallbackEntries: primary.fallbackEntries,
            }).map((candidate) => candidate.id),
        ).toEqual(["primary", "target"]);
    });

    it("does not apply the community fallback cap to registry declarations", () => {
        const targetIds = ["one", "two", "three", "four"];
        const primary = registryEntry("primary", targetIds);
        const targets = targetIds.map((id) => registryEntry(id));
        const entries = [primary, ...targets];

        linkFallbackEntries(
            entries,
            new Map(entries.map((entry) => [entry.id, entry])),
        );

        expect(primary.fallbackEntries?.map((entry) => entry.id)).toEqual(
            targetIds,
        );
    });
    it("guards community declarations but trusts registry declarations", () => {
        const ownPrimary = communityEntry(
            "owner/primary",
            "owner",
            "public",
            null,
            ["owner/private", "other/private", "owner/disabled"],
            20,
        );

        const ownPrivate = communityEntry("owner/private", "owner", "private");
        const otherPrivate = communityEntry(
            "other/private",
            "other",
            "private",
        );
        const disabled = communityEntry(
            "owner/disabled",
            "owner",
            "public",
            Date.now(),
        );
        const registryPrimary = registryEntry("registry", [
            "public",
            "owner/private",
            "owner/disabled",
        ]);
        const publicTarget = communityEntry("public", "other");
        const entries = [
            ownPrimary,
            ownPrivate,
            otherPrivate,
            disabled,
            registryPrimary,
            publicTarget,
        ];
        const byId = new Map(entries.map((entry) => [entry.id, entry]));

        linkFallbackEntries(entries, byId);

        expect(ownPrimary.fallbackEntries?.map((entry) => entry.id)).toEqual([
            "owner/private",
        ]);
        expect(
            registryPrimary.fallbackEntries?.map((entry) => entry.id),
        ).toEqual(["public", "owner/private", "owner/disabled"]);
    });

    it("keeps a paid-only target off a primary that takes Quest Pollen", () => {
        const anyPollen = communityEntry("owner/any", "owner", "public", null, [
            "other/paid",
            "other/free",
        ]);
        const paidPrimary = communityEntry(
            "owner/paid",
            "owner",
            "public",
            null,
            ["other/paid", "other/free"],
            10,
            true,
        );
        const paidTarget = communityEntry(
            "other/paid",
            "other",
            "public",
            null,
            [],
            10,
            true,
        );
        const freeTarget = communityEntry("other/free", "other");
        const entries = [anyPollen, paidPrimary, paidTarget, freeTarget];

        linkFallbackEntries(entries, new Map(entries.map((e) => [e.id, e])));

        expect(anyPollen.fallbackEntries?.map((entry) => entry.id)).toEqual([
            "other/free",
        ]);
        expect(paidPrimary.fallbackEntries?.map((entry) => entry.id)).toEqual([
            "other/paid",
            "other/free",
        ]);
    });

    it("does not link an edits-capable image model to a generations-only target", () => {
        const primary = communityEntry(
            "owner/edit",
            "owner",
            "public",
            null,
            ["owner/gen-only"],
            0.02,
        );
        primary.eventType = "generate.image";
        primary.supportedEndpoints = [
            "/v1/images/generations",
            "/v1/images/edits",
            "/image/{prompt}",
        ];
        primary.communityEndpoint = {
            ...primary.communityEndpoint,
            modality: "image",
            imagePricing: "request",
            ...communityEndpointPrices({ completionImagePrice: 0.02 }),
        } as GenerationModelEntry["communityEndpoint"];

        const genOnly = communityEntry("owner/gen-only", "owner", "public");
        genOnly.eventType = "generate.image";
        genOnly.supportedEndpoints = [
            "/v1/images/generations",
            "/image/{prompt}",
        ];
        genOnly.communityEndpoint = {
            ...genOnly.communityEndpoint,
            modality: "image",
            imagePricing: "request",
            ...communityEndpointPrices({ completionImagePrice: 0.01 }),
        } as GenerationModelEntry["communityEndpoint"];

        const entries = [primary, genOnly];
        linkFallbackEntries(
            entries,
            new Map(entries.map((entry) => [entry.id, entry])),
        );

        expect(primary.fallbackEntries).toBeUndefined();
    });

    it("does not link community fallbacks across modalities", () => {
        const primary = communityEntry("owner/image", "owner", "public", null, [
            "owner/video",
        ]);
        primary.eventType = "generate.image";
        primary.communityEndpoint = {
            ...primary.communityEndpoint,
            modality: "image",
        } as GenerationModelEntry["communityEndpoint"];

        const target = communityEntry("owner/video", "owner");
        // Images and videos share the same event type, so the modality check is
        // what prevents a stale image fallback from routing into a video model.
        target.eventType = "generate.image";
        target.communityEndpoint = {
            ...target.communityEndpoint,
            modality: "video",
        } as GenerationModelEntry["communityEndpoint"];

        const entries = [primary, target];
        linkFallbackEntries(
            entries,
            new Map(entries.map((entry) => [entry.id, entry])),
        );

        expect(primary.fallbackEntries).toBeUndefined();
    });
});

describe("formatFallbackTarget", () => {
    it("formats the marker for index > 0", () => {
        expect(formatFallbackTarget(1)).toBe("config.targets[1]");
        expect(formatFallbackTarget(2)).toBe("config.targets[2]");
        expect(formatFallbackTarget(10)).toBe("config.targets[10]");
    });
});

describe("attachFallbackTarget", () => {
    it("stores the target marker without making it enumerable", () => {
        const completion = { id: "chatcmpl_test", model: "openai" };
        attachFallbackTarget(completion, 1);
        expect((completion as { fallbackTarget?: string }).fallbackTarget).toBe(
            "config.targets[1]",
        );
        expect(
            Object.prototype.propertyIsEnumerable.call(
                completion,
                "fallbackTarget",
            ),
        ).toBe(false);
        expect(JSON.stringify({ ...completion })).not.toContain(
            "fallbackTarget",
        );
    });

    it("leaves the primary response untouched", () => {
        const completion = { id: "chatcmpl_test" };
        attachFallbackTarget(completion, 0);
        expect(completion).not.toHaveProperty("fallbackTarget");
    });
});

/**
 * The single decision point every modality shares, so the cases that must never
 * fail over — and the ones that must — are pinned here rather than per handler.
 */
describe("isRetryableFallbackError", () => {
    // The text client remaps before throwing and keeps the raw status.
    const textFailure = (
        upstreamStatus: number,
        details?: unknown,
    ): Error & { status: number; upstreamStatus: number; details?: unknown } =>
        Object.assign(new Error(`${upstreamStatus} upstream`), {
            status: upstreamStatus === 429 ? 502 : upstreamStatus,
            upstreamStatus,
            details,
        });

    it("fails over on a rate-limited or broken upstream", () => {
        expect(isRetryableFallbackError(textFailure(429))).toBe(true);
        expect(isRetryableFallbackError(textFailure(503))).toBe(true);
        expect(isRetryableFallbackError(textFailure(524))).toBe(true);
        expect(isRetryableFallbackError(textFailure(599))).toBe(true);
        expect(
            isRetryableFallbackError(
                UpstreamError.fromProvider(500, { message: "down" }),
            ),
        ).toBe(true);
        expect(
            isRetryableFallbackError(
                UpstreamError.fromProvider(402, { message: "no quota" }),
            ),
        ).toBe(true);
    });

    it("uses the wrapper status for a malformed successful response", () => {
        expect(
            isRetryableFallbackError(
                Object.assign(new Error("upstream returned no output"), {
                    status: 502,
                    upstreamStatus: 200,
                }),
            ),
        ).toBe(true);
    });

    it("does not multiply the owned Portkey timeout across fallbacks", () => {
        expect(
            isRetryableFallbackError(
                textFailure(408, {
                    error: {
                        message:
                            "Request exceeded the timeout sent in the request: 290000ms",
                        type: "timeout_error",
                        param: null,
                        code: null,
                    },
                }),
            ),
        ).toBe(false);
        expect(isRetryableFallbackError(textFailure(408))).toBe(true);
    });

    it("does not fail over on caller errors", () => {
        expect(isRetryableFallbackError(textFailure(400))).toBe(false);
        expect(
            isRetryableFallbackError(
                UpstreamError.fromProvider(422, { message: "bad input" }),
            ),
        ).toBe(false);
    });

    // Verified against staging: a community endpoint whose host is unreachable
    // never reaches the provider, so the gateway answers for it — with a 400,
    // which is otherwise the one status that must not fail over.
    it("fails over when the gateway could not reach the endpoint at all", () => {
        // The text client attaches the parsed body...
        expect(
            isRetryableFallbackError(
                textFailure(400, {
                    status: "failure",
                    message: "Invalid custom host",
                }),
            ),
        ).toBe(true);
        // ...the image client keeps the raw string.
        const rawBody = Object.assign(new Error("400 Invalid custom host"), {
            status: 400,
            upstreamStatus: 400,
            responseBody: JSON.stringify({
                status: "failure",
                message: "Invalid custom host",
            }),
        });
        expect(isRetryableFallbackError(rawBody)).toBe(true);
    });

    it("still refuses a provider's own 400 proxied through the gateway", () => {
        // Same status and same hop, told apart only by the envelope: a proxied
        // provider error keeps its `error` key, so retrying it elsewhere would
        // fail identically.
        expect(
            isRetryableFallbackError(
                textFailure(400, {
                    error: { message: "openai error: Invalid model or alias" },
                }),
            ),
        ).toBe(false);
    });

    it("does not shop a content-policy refusal to a laxer endpoint", () => {
        expect(
            isRetryableFallbackError(
                textFailure(403, {
                    error: {
                        message:
                            "Gemini blocked the request: PROHIBITED_CONTENT",
                    },
                }),
            ),
        ).toBe(false);
        expect(
            isRetryableFallbackError(
                textFailure(500, {
                    error: { message: "content policy violation" },
                }),
            ),
        ).toBe(false);
        expect(
            isRetryableFallbackError(
                UpstreamError.fromProvider(502, {
                    message: "upstream failed",
                    responseBody: JSON.stringify({
                        detail: "flagged as sensitive",
                    }),
                }),
            ),
        ).toBe(false);
    });

    it("fails over when the provider blocked our account, not the prompt", () => {
        // Azure suspends the whole deployment and says "content policy" while
        // doing it; a sibling endpoint still serves, so this must retry.
        expect(
            isRetryableFallbackError(
                textFailure(500, {
                    error: {
                        message:
                            "Your resource has been temporarily blocked for content policy reasons",
                    },
                }),
            ),
        ).toBe(true);
    });

    it("fails over on a network-level failure but not on our own bugs", () => {
        expect(isRetryableFallbackError(new TypeError("fetch failed"))).toBe(
            true,
        );
        expect(
            isRetryableFallbackError(
                new TypeError("Cannot read properties of undefined"),
            ),
        ).toBe(false);
        expect(isRetryableFallbackError(new Error("misconfigured"))).toBe(
            false,
        );
        expect(isRetryableFallbackError("not an error")).toBe(false);
    });
});

describe("withModelFallback", () => {
    const candidate = (id: string): FallbackCandidate => ({ id });
    const rateLimited = () =>
        Object.assign(new Error("429 upstream"), {
            status: 502,
            upstreamStatus: 429,
        });

    /** How the ordered trace reads, with ! on a terminal failure. */
    const seen = (attempts: FallbackAttempt[]) =>
        attempts.map((attempt) =>
            attempt.settled && attempt.error
                ? `${attempt.candidate.id}!`
                : attempt.candidate.id,
        );

    it("reports every failure, marking the one that ended the request", async () => {
        const attempts: FallbackAttempt[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second"), candidate("third")],
                attempt,
                attempts,
            ),
        ).rejects.toThrow("429 upstream");

        // Three calls, three failures reported. Tracking treats the final
        // element as the request outcome and emits the earlier two separately.
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(seen(attempts)).toEqual(["primary", "second", "third!"]);
    });

    it("reports the only model tried when it is the one that failed", async () => {
        const attempts: FallbackAttempt[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });

        await expect(
            withModelFallback([candidate("primary")], attempt, attempts),
        ).rejects.toThrow("429 upstream");

        // The overwhelmingly common shape: no fallbacks declared. The failure
        // is terminal, so it is named but produces no row of its own.
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(seen(attempts)).toEqual(["primary!"]);
    });

    it("stops the chain on a caller error and reports it as terminal", async () => {
        const attempts: FallbackAttempt[] = [];
        const badRequest = Object.assign(new Error("400 upstream"), {
            status: 400,
            upstreamStatus: 400,
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second")],
                async () => {
                    throw badRequest;
                },
                attempts,
            ),
        ).rejects.toThrow("400 upstream");

        // Nothing was moved on from, but the 400 still came from a named
        // model, and that name is the only thing the response cannot carry.
        expect(seen(attempts)).toEqual(["primary!"]);
    });

    it("supports a route-specific fallback policy", async () => {
        const attempt = vi.fn(async () => "served");
        attempt.mockRejectedValueOnce(
            UpstreamError.fromProvider(524, { message: "ambiguous timeout" }),
        );
        const shouldFallback = vi.fn(() => false);

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second")],
                attempt,
                undefined,
                undefined,
                shouldFallback,
            ),
        ).rejects.toThrow("ambiguous timeout");

        expect(attempt).toHaveBeenCalledOnce();
        expect(shouldFallback).toHaveBeenCalledOnce();
    });

    it("tries the next model for any upstream 5xx", async () => {
        const primary = registryEntry("primary", ["second"]);
        const second = registryEntry("second");
        primary.fallbackEntries = [second];
        const candidates = fallbackCandidates({
            resolved: primary.id,
            definition: primary.definition,
            fallbackEntries: primary.fallbackEntries,
        });
        const attempt = vi.fn(async () => "served");
        attempt.mockRejectedValueOnce(
            UpstreamError.fromProvider(524, { message: "gateway timeout" }),
        );

        await expect(withModelFallback(candidates, attempt)).resolves.toEqual({
            result: "served",
            candidate: expect.objectContaining({ id: "second" }),
            index: 1,
        });
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it("reports the failed and serving attempts in order", async () => {
        const attempts: FallbackAttempt[] = [];
        const attempt = vi
            .fn<(c: FallbackCandidate) => Promise<string>>()
            .mockRejectedValueOnce(rateLimited())
            .mockResolvedValueOnce("served");

        const {
            result,
            candidate: served,
            index,
        } = await withModelFallback(
            [candidate("primary"), candidate("second"), candidate("third")],
            attempt,
            attempts,
        );

        expect(result).toBe("served");
        expect(served.id).toBe("second");
        expect(index).toBe(1);
        expect(seen(attempts)).toEqual(["primary", "second"]);
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it("preserves an upstream failure when a later candidate is blocked locally", async () => {
        const attempts: FallbackAttempt[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });
        const beforeAttempt = vi.fn(async (current: FallbackCandidate) => {
            if (current.id === "second") throw new Error("local limit");
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second")],
                attempt,
                attempts,
                beforeAttempt,
            ),
        ).rejects.toThrow("local limit");

        expect(attempt).toHaveBeenCalledTimes(1);
        // The real provider failure remains unsettled and therefore gets its
        // own row; the local gate called no provider and is not added.
        expect(seen(attempts)).toEqual(["primary"]);
    });
});

describe("withModelFallbackResponse", () => {
    it("marks a response served by the shared fallback loop", async () => {
        const primary = registryEntry("primary", ["target"]);
        const target = registryEntry("target");
        primary.fallbackEntries = [target];
        const beforeAttempt = vi.fn(
            async (_candidate: FallbackCandidate) => {},
        );

        const attempts: FallbackAttempt[] = [];
        const response = await withModelFallbackResponse(
            {
                resolved: primary.id,
                definition: primary.definition,
                fallbackEntries: primary.fallbackEntries,
            },
            async (candidate) => {
                if (candidate.id === "primary") {
                    throw Object.assign(new Error("rate limited"), {
                        status: 429,
                    });
                }
                return Response.json({ model: candidate.id });
            },
            attempts,
            beforeAttempt,
        );

        expect(attempts.at(-1)?.candidate.entry?.id).toBe("target");
        expect(
            beforeAttempt.mock.calls.map(([candidate]) => candidate.id),
        ).toEqual(["primary", "target"]);
        expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[1]",
        );
        await expect(response.json()).resolves.toEqual({ model: "target" });
    });
});
