import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { describe, expect, it, vi } from "vitest";
import {
    type FailedCall,
    type FallbackCandidate,
    fallbackCandidates,
    isRetryableFallbackError,
    linkFallbackEntries,
    withModelFallback,
} from "../src/fallback.ts";
import { HttpError } from "../src/image/httpError.ts";
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
    disabledAt: number | null = null,
    fallbackModelIds: string[] = [],
    rate = 10,
): GenerationModelEntry {
    const entry = registryEntry(id, [], rate);
    entry.visible = visibility === "public" && disabledAt === null;
    entry.communityEndpoint = {
        ownerUserId,
        visibility,
        disabledAt,
        imagePricing: "request",
        fallbackModelIds,
        ...communityEndpointPrices({
            promptTextPrice: rate,
            completionTextPrice: rate,
        }),
    } as GenerationModelEntry["communityEndpoint"];
    return entry;
}

describe("registry fallback linking", () => {
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
        expect(isRetryableFallbackError(new HttpError("down", 500))).toBe(true);
        expect(isRetryableFallbackError(new HttpError("no quota", 402))).toBe(
            true,
        );
    });

    it("does not fail over on caller errors", () => {
        expect(isRetryableFallbackError(textFailure(400))).toBe(false);
        expect(isRetryableFallbackError(new HttpError("bad input", 422))).toBe(
            false,
        );
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
                textFailure(500, {
                    error: { message: "content policy violation" },
                }),
            ),
        ).toBe(false);
        expect(
            isRetryableFallbackError(
                new HttpError("upstream failed", 502, {
                    body: JSON.stringify({ detail: "flagged as sensitive" }),
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

    /** How the loop's own record of a failure reads, most compactly. */
    const seen = (failures: FailedCall[]) =>
        failures.map((f) =>
            f.terminal ? `${f.candidate.id}!` : f.candidate.id,
        );

    it("reports every failure, marking the one that ended the request", async () => {
        const failures: FailedCall[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });

        await expect(
            withModelFallback(
                [candidate("primary"), candidate("second"), candidate("third")],
                attempt,
                failures,
            ),
        ).rejects.toThrow("429 upstream");

        // Three calls, three failures reported. Only the terminal one is
        // flagged, because it is the request's outcome rather than an attempt
        // that was moved on from — tracking turns that flag into one row per
        // upstream call.
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(seen(failures)).toEqual(["primary", "second", "third!"]);
    });

    it("reports the only model tried when it is the one that failed", async () => {
        const failures: FailedCall[] = [];
        const attempt = vi.fn(async () => {
            throw rateLimited();
        });

        await expect(
            withModelFallback([candidate("primary")], attempt, failures),
        ).rejects.toThrow("429 upstream");

        // The overwhelmingly common shape: no fallbacks declared. The failure
        // is terminal, so it is named but produces no row of its own.
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(seen(failures)).toEqual(["primary!"]);
    });

    it("stops the chain on a caller error and reports it as terminal", async () => {
        const failures: FailedCall[] = [];
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
                failures,
            ),
        ).rejects.toThrow("400 upstream");

        // Nothing was moved on from, but the 400 still came from a named
        // model, and that name is the only thing the response cannot carry.
        expect(seen(failures)).toEqual(["primary!"]);
    });

    it("reports only the failures it moved on from once a model serves", async () => {
        const failures: FailedCall[] = [];
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
            failures,
        );

        expect(result).toBe("served");
        expect(served.id).toBe("second");
        expect(index).toBe(1);
        expect(seen(failures)).toEqual(["primary"]);
        expect(attempt).toHaveBeenCalledTimes(2);
    });
});
