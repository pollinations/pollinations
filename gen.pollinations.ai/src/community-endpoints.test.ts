import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { verifyAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointModality,
    type CommunityEndpointRuntime,
    communityChatCompletionsUrl,
    communityEndpointPriceFieldsForModality,
    communityEndpointPrices,
    communityEndpointTitle,
    communityImageEditsUrl,
    communityImageGenerationsUrl,
    communityModelDefinition,
    communityModelId,
    communityOpenAIBaseUrl,
    communityPriceDefinition,
    type ExternalCommunityEndpointRuntime,
    isCommunityEndpointOwnerAllowed,
    isCommunityFallbackPricingAllowed,
    legacyCommunityModelId,
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MAX_COMMUNITY_PRICE_PER_TOKEN,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
    normalizeCommunityAssetUrl,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    normalizeCommunityProviderUrl,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import {
    agent as agentTable,
    communityEndpoint as communityEndpointTable,
    session as sessionTable,
} from "@shared/db/better-auth.ts";
import { handleError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { DEFAULT_3D_MODEL } from "@shared/registry/model3d.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import {
    calculateUsageBilling,
    getRegistryModelDefinition,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import {
    createTestApiKey,
    createTestUser,
    test as fixtureTest,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { withInlineGenerationCoordinator } from "../test/helpers/inline-generation-coordinator.ts";
import {
    communityImageSupportedEndpoints,
    getCommunityModelRegistryEntries,
} from "./community-models.ts";
import { callCommunityImageEndpoint } from "./image/communityEndpoint.ts";
import worker from "./index.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "./model-registry.ts";
import { communityEndpointGatewayContext } from "./text/communityEndpoint.ts";

const db = drizzle(env.DB);
const testLog = { getChild: () => testLog } as unknown as Logger;
const COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID = 36901823;
const COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID = 999_999_999;
const TEST_PNG_BASE64 = "iVBORw0KGgo=";
const TEST_PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];
const TEST_INVALID_IMAGE_BASE64 = "bm90IGFuIGltYWdl";
const TEST_COMMUNITY_IMAGE_URL = "http://api.example.com/assets/image.png";
const TEST_INPUT_IMAGE_URL = "https://input.example.com/source.png";

function isPortkeyChatCompletionsRequest(request: Request): boolean {
    return new URL(request.url).pathname === "/v1/chat/completions";
}

function isCommunityImageGenerationsRequest(request: Request): boolean {
    return new URL(request.url).pathname.endsWith("/images/generations");
}

function isCommunityImageEditsRequest(request: Request): boolean {
    return new URL(request.url).pathname.endsWith("/images/edits");
}

beforeEach(() => {
    resetGenerationModelRegistryCache();
});

afterEach(() => {
    resetGenerationModelRegistryCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function createEnterCommunityApi(): Promise<Hono<Env>> {
    const routePath =
        "../../enter.pollinations.ai/src/routes/community-endpoints.ts";
    const { communityEndpointsRoutes } = (await import(routePath)) as {
        communityEndpointsRoutes: Hono;
    };
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            await next();
        })
        .route("/api/community-endpoints", communityEndpointsRoutes)
        .onError(handleError);
}

async function createEnterFrontendApi(): Promise<Hono<Env>> {
    const routePath = "../../enter.pollinations.ai/src/frontend-api.ts";
    const { frontendApi } = (await import(routePath)) as {
        frontendApi: Hono;
    };
    return (
        new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                await next();
            })
            .route("/api", frontendApi)
            // Mirror production: enter's root app registers handleError
            // (enter.pollinations.ai/src/index.ts), which maps ValidationError
            // to a 400 instead of Hono's default 500.
            .onError(handleError)
    );
}

async function fetchEnterApi(
    app: Hono<Env>,
    request: Request,
    envOverride: typeof env = env,
): Promise<Response> {
    const ctx = createExecutionContext();
    return app.fetch(request, envOverride, ctx);
}

async function fetchGen(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(input, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    const body = response.body ? await response.arrayBuffer() : null;
    await waitOnExecutionContext(ctx);
    return new Response(body, response);
}

async function signedSessionCookie(token: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.BETTER_AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(token),
    );
    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    );
    return `better-auth.session_token=${encodeURIComponent(`${token}.${encodedSignature}`)}`;
}

async function expectCommunityPortkeyRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    expected: {
        customHost: string;
        bearerToken: string;
        upstreamModel: string;
        body: Record<string, unknown>;
    },
): Promise<void> {
    const request = new Request(input, init);

    expect(isPortkeyChatCompletionsRequest(request)).toBe(true);
    expect(request.headers.get("authorization")).toBe(
        `Bearer ${expected.bearerToken}`,
    );
    expect(request.headers.get("x-portkey-provider")).toBe("openai");
    expect(request.headers.get("x-portkey-custom-host")).toBe(
        expected.customHost,
    );
    expect(request.headers.get("x-portkey-model")).toBe(expected.upstreamModel);
    expect(request.headers.get("x-portkey-strict-open-ai-compliance")).toBe(
        "false",
    );
    await expect(request.json()).resolves.toMatchObject({
        model: expected.upstreamModel,
        ...expected.body,
    });
}

async function expectCommunityImageGenerationsRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    expected: {
        bearerToken: string;
        body: Record<string, unknown>;
    },
): Promise<void> {
    const request = new Request(input, init);

    expect(isCommunityImageGenerationsRequest(request)).toBe(true);
    expect(request.headers.get("authorization")).toBe(
        `Bearer ${expected.bearerToken}`,
    );
    expect(request.headers.get("content-type")).toContain("application/json");
    const body = await request.json();
    expect(body).toMatchObject(expected.body);
    expect(body).not.toHaveProperty("response_format");
}

function isBillingFetch(request: Request): boolean {
    return (
        request.url.startsWith("https://api.europe-west2.gcp.tinybird.co/") ||
        request.url.startsWith("http://localhost:7181/")
    );
}

/** Tinybird ingest bodies are newline-delimited JSON, one row per event. */
function parseIngestedEvents(body: string): Record<string, unknown>[] {
    return body
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function createCommunityFallbackPair({
    prefix,
    modality = "text",
    primaryName = "primary",
    fallbackName = "cheap",
    primaryPerUserRpm,
    fallbackPerUserRpm,
}: {
    prefix: string;
    modality?: CommunityEndpointModality;
    primaryName?: string;
    fallbackName?: string;
    primaryPerUserRpm?: number;
    fallbackPerUserRpm?: number;
}) {
    const primaryToken = "sk_primary_token";
    const fallbackToken = "sk_fallback_token";
    const suffix = crypto.randomUUID().slice(0, 8);
    const primaryOwner = `${prefix}-primary-${suffix}`;
    const fallbackOwner = `${prefix}-fallback-${suffix}`;
    const primaryUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: primaryOwner,
    });
    const fallbackUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: fallbackOwner,
    });
    const primaryModelId = communityModelId(primaryOwner, primaryName);
    const fallbackModelId = communityModelId(fallbackOwner, fallbackName);
    const primaryHostname = `${prefix}-primary.example.com`;
    const fallbackHostname = `${prefix}-fallback.example.com`;
    const primaryHost = `https://${primaryHostname}/v1`;
    const fallbackHost = `https://${fallbackHostname}/v1`;
    const primaryUpstreamModel = `${primaryName}-upstream`;
    const fallbackUpstreamModel = `${fallbackName}-upstream`;
    const priceFields = (price: number) =>
        modality === "image"
            ? {
                  promptTextPrice: 0,
                  completionTextPrice: 0,
                  completionImagePrice: price,
              }
            : { promptTextPrice: price, completionTextPrice: price };
    const [primaryPrice, fallbackPrice] =
        modality === "image"
            ? [0.02, 0.01]
            : [0.2 / 1_000_000, 0.1 / 1_000_000];

    await db.insert(communityEndpointTable).values([
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId: primaryUserId,
            visibility: "public",
            perUserRpm: primaryPerUserRpm,
            name: primaryName,
            modality,
            baseUrl: primaryHost,
            upstreamModel: primaryUpstreamModel,
            bearerTokenCiphertext: await encryptSecret(
                primaryToken,
                env.BETTER_AUTH_SECRET,
            ),
            ...priceFields(primaryPrice),
            fallbackModelIds: [fallbackModelId],
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId: fallbackUserId,
            visibility: "public",
            perUserRpm: fallbackPerUserRpm,
            name: fallbackName,
            modality,
            baseUrl: fallbackHost,
            upstreamModel: fallbackUpstreamModel,
            bearerTokenCiphertext: await encryptSecret(
                fallbackToken,
                env.BETTER_AUTH_SECRET,
            ),
            ...priceFields(fallbackPrice),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]);

    return {
        primaryModelId,
        fallbackModelId,
        primaryHost,
        fallbackHost,
        primaryHostname,
        fallbackHostname,
        primaryUpstreamModel,
        fallbackUpstreamModel,
        primaryToken,
        fallbackToken,
    };
}

describe("community endpoint helpers", () => {
    it("checks the community endpoint owner GitHub ID allowlist", () => {
        expect(
            isCommunityEndpointOwnerAllowed({
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            }),
        ).toBe(true);
        expect(
            isCommunityEndpointOwnerAllowed({
                githubId: COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID,
            }),
        ).toBe(false);
        expect(isCommunityEndpointOwnerAllowed({ githubId: 101795137 })).toBe(
            true,
        );
        expect(isCommunityEndpointOwnerAllowed({ githubId: 183505255 })).toBe(
            true,
        );
        expect(isCommunityEndpointOwnerAllowed({ githubId: 235942848 })).toBe(
            false,
        );
        expect(isCommunityEndpointOwnerAllowed({ githubId: null })).toBe(false);
    });

    it("normalizes bearer tokens with or without the scheme", () => {
        expect(normalizeCommunityEndpointBearerToken("sk_test")).toBe(
            "sk_test",
        );
        expect(
            normalizeCommunityEndpointBearerToken("  Bearer sk_test  "),
        ).toBe("sk_test");
        expect(() => normalizeCommunityEndpointBearerToken("Bearer ")).toThrow(
            "API bearer token is required",
        );
    });

    it("round-trips community model ids", () => {
        const modelId = communityModelId(
            "voodoohop",
            "provider/path/model-name",
        );
        const legacyModelId = legacyCommunityModelId(
            "voodoohop",
            "provider/path/model-name",
        );

        expect(modelId).toBe("voodoohop/provider/path/model-name");
        expect(legacyModelId).toBe(
            "community/voodoohop/provider/path/model-name",
        );
        expect(parseCommunityModelId(modelId)).toEqual({
            ownerGithubUsername: "voodoohop",
            modelName: "provider/path/model-name",
        });
        expect(parseCommunityModelId(legacyModelId)).toEqual({
            ownerGithubUsername: "voodoohop",
            modelName: "provider/path/model-name",
        });
        expect(parseCommunityModelId("openai")).toBeNull();
    });

    it("normalizes OpenAI-compatible endpoint URLs", () => {
        expect(
            normalizeCommunityEndpointBaseUrl("https://api.example.com/v1/"),
        ).toBe("https://api.example.com/v1");
        expect(
            normalizeCommunityEndpointBaseUrl(
                "https://api.example.com/v1?ignored=1#section",
            ),
        ).toBe("https://api.example.com/v1");
        expect(communityChatCompletionsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/chat/completions",
        );
        expect(communityImageGenerationsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/images/generations",
        );
        expect(communityImageEditsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/images/edits",
        );
        expect(
            communityChatCompletionsUrl(
                "https://api.example.com/v1/chat/completions",
            ),
        ).toBe("https://api.example.com/v1/chat/completions");
        expect(
            communityImageGenerationsUrl(
                "https://api.example.com/v1/images/generations",
            ),
        ).toBe("https://api.example.com/v1/images/generations");
        expect(
            communityImageEditsUrl(
                "https://api.example.com/v1/images/generations",
            ),
        ).toBe("https://api.example.com/v1/images/edits");
        expect(
            communityImageGenerationsUrl(
                "https://api.example.com/v1/images/edits",
            ),
        ).toBe("https://api.example.com/v1/images/generations");
        expect(
            normalizeCommunityAssetUrl(
                "http://api.example.com/assets/image.png#fragment",
                "https://api.example.com/v1",
            ),
        ).toBe("http://api.example.com/assets/image.png");
        expect(() =>
            normalizeCommunityAssetUrl(
                "http://169.254.169.254/image.png",
                "https://api.example.com/v1",
            ),
        ).toThrow("Image URL cannot target a private host");
        expect(() =>
            normalizeCommunityAssetUrl(
                "http://cdn.example.com/image.png",
                "https://api.example.com/v1",
            ),
        ).toThrow("HTTP image URL must use the endpoint host");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("http://api.example.com/v1"),
        ).toThrow("Endpoint URL must use https");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("https://localhost/v1"),
        ).toThrow("Endpoint URL cannot target a private host");
    });

    it("normalizes public community provider URLs", () => {
        expect(
            normalizeCommunityProviderUrl(" https://example.com/models#top "),
        ).toBe("https://example.com/models");
        expect(() =>
            normalizeCommunityProviderUrl("http://example.com"),
        ).toThrow("Provider URL must use https");
        expect(() =>
            normalizeCommunityProviderUrl("https://user:pass@example.com"),
        ).toThrow("Provider URL cannot include credentials");
    });

    it("uses the community endpoint description as the model title", () => {
        const modelDefinition = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: "OpenAI via community endpoint",
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        });

        expect(modelDefinition.title).toBe("OpenAI via community endpoint");
        expect(modelDefinition.aliases).toEqual(["community/voodoohop/openai"]);
        expect(modelDefinition.description).toBe(
            "OpenAI via community endpoint",
        );
    });

    it("prefers a stored title over the description", () => {
        const modelDefinition = communityModelDefinition({
            modelId: "voodoohop/openai",
            title: "OpenAI Fast",
            description: "OpenAI via community endpoint",
            ...communityEndpointPrices({ promptTextPrice: 0.1 }),
        });

        expect(modelDefinition.title).toBe("OpenAI Fast");
        // Description stays its own field so both can render independently.
        expect(modelDefinition.description).toBe(
            "OpenAI via community endpoint",
        );
    });

    it("projects a provider profile onto the community model brand", () => {
        const modelDefinition = communityModelDefinition({
            modelId: "voodoohop/openai",
            title: "OpenAI Fast",
            description: null,
            providerName: "Example AI",
            providerUrl: "https://example.com/",
            ...communityEndpointPrices({}),
        });

        expect(modelDefinition.brand).toBe("Example AI");
        expect(modelDefinition.brandUrl).toBe("https://example.com/");
    });

    it("falls back to the model name when title and description are unset", () => {
        expect(
            communityEndpointTitle({
                modelId: "voodoohop/openai",
                title: null,
                description: null,
            }),
        ).toBe("openai");
        // Whitespace-only titles are treated as unset rather than rendering blank.
        expect(
            communityEndpointTitle({
                modelId: "voodoohop/openai",
                title: "   ",
                description: "Community endpoint",
            }),
        ).toBe("Community endpoint");
    });

    it("builds community image models with one fixed per-image price", () => {
        const modelId = "voodoohop/flux";
        const definition = communityModelDefinition({
            modelId,
            description: "Community image model",
            modality: "image",
            ...communityEndpointPrices({
                promptTextPrice: 0.2,
                completionImagePrice: 0.03,
            }),
        });

        expect(definition).toMatchObject({
            category: "image",
            inputModalities: ["text"],
            flatRate: true,
            cost: { completionImageTokens: 0.03 },
        });
        expect(definition.cost).not.toHaveProperty("promptTextTokens");
        expect(
            calculateUsageBilling({
                model: modelId,
                usage: { completionImageTokens: 1 },
                servedBy: definition,
            }).price.totalPrice,
        ).toBe(0.03);
    });

    it("advertises image edits only for models with image input", () => {
        expect(communityImageSupportedEndpoints(["text"])).not.toContain(
            "/v1/images/edits",
        );
        expect(communityImageSupportedEndpoints(["text", "image"])).toContain(
            "/v1/images/edits",
        );
    });

    it("builds token-priced community image models when the probe detected usage", () => {
        const modelId = "voodoohop/gptimage";
        const definition = communityModelDefinition({
            modelId,
            description: "Token-priced image model",
            modality: "image",
            imagePricing: "tokens",
            inputModalities: ["text", "image"],
            ...communityEndpointPrices({
                promptTextPrice: 0.000005,
                promptImagePrice: 0.00001,
                completionImagePrice: 0.00004,
            }),
        });

        expect(definition).toMatchObject({
            category: "image",
            inputModalities: ["text", "image"],
            flatRate: false,
            cost: {
                promptTextTokens: 0.000005,
                promptImageTokens: 0.00001,
                completionImageTokens: 0.00004,
            },
        });
        expect(
            calculateUsageBilling({
                model: modelId,
                usage: {
                    promptTextTokens: 100,
                    promptImageTokens: 0,
                    completionImageTokens: 1000,
                },
                servedBy: definition,
            }).price.totalPrice,
        ).toBeCloseTo(0.000005 * 100 + 0.00004 * 1000, 10);
    });

    it("keeps zero prices as explicit zero rates in the price definition", () => {
        const definition = communityPriceDefinition(
            communityEndpointPrices({ promptTextPrice: 0.5 }),
            "text",
        );

        expect(definition.promptTextTokens).toBe(0.5);
        expect(definition.completionTextTokens).toBe(0);
        // Every usage type gets an explicit rate, so billing never treats an
        // intentionally-free bucket as a missing conversion rate.
        expect(Object.keys(definition)).toHaveLength(
            communityEndpointPriceFieldsForModality("text").length,
        );
    });

    it('defaults input modalities to ["text"] when not declared', () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: "OpenAI via community endpoint",
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        });

        expect(definition.inputModalities).toEqual(["text"]);
    });

    it("preserves explicitly declared input modalities", () => {
        const definition = communityModelDefinition({
            modelId: "marcosfrgames08/glm-4.6v-flash",
            description: "Vision model",
            inputModalities: ["image", "video"],
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        });

        expect(definition.inputModalities).toEqual(["image", "video"]);
    });

    it("filters inputs that image endpoints cannot accept", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/gptimage",
            description: "Image model",
            modality: "image",
            inputModalities: ["text", "audio"],
            ...communityEndpointPrices({
                promptTextPrice: 0.2,
                completionImagePrice: 0.03,
            }),
        });

        expect(definition.inputModalities).toEqual(["text"]);
    });

    describe("fallback target pricing", () => {
        const uniformPrices = (price: number) =>
            communityEndpointPrices(
                Object.fromEntries(
                    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
                        field.key,
                        price,
                    ]),
                ),
            );

        it("allows an equally priced target", () => {
            expect(
                isCommunityFallbackPricingAllowed(
                    uniformPrices(0.5),
                    uniformPrices(0.5),
                ),
            ).toBe(true);
        });

        it("allows a target that is cheaper on every field", () => {
            expect(
                isCommunityFallbackPricingAllowed(
                    uniformPrices(0.5),
                    uniformPrices(0.25),
                ),
            ).toBe(true);
        });

        it("rejects a target that is more expensive on any single field", () => {
            // Every price column, so a newly added one cannot silently escape
            // the same-or-lower rule.
            for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
                expect(
                    isCommunityFallbackPricingAllowed(uniformPrices(0.5), {
                        ...uniformPrices(0.5),
                        [field.key]: 0.51,
                    }),
                ).toBe(false);
            }
        });
    });

    describe("community image endpoint billing", () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        const secret = "test-secret";
        const imageParams = {
            model: "gpt-image-1",
            width: 1024,
            height: 1024,
            quality: "medium",
            transparent: false,
            image: [],
        } as unknown as Parameters<typeof callCommunityImageEndpoint>[2];

        async function imageEndpoint(
            imagePricing: CommunityEndpointRuntime["imagePricing"],
        ): Promise<CommunityEndpointRuntime> {
            return {
                kind: "external",
                id: "community-endpoint-id",
                ownerUserId: "owner-id",
                modelId: "voodoohop/gptimage",
                name: "gptimage",
                title: "GPT Image",
                description: null,
                delegatesGeneration: false,
                modality: "image",
                imagePricing,
                inputModalities: null,
                baseUrl: "https://api.example.com/v1",
                upstreamModel: "gpt-image-1",
                visibility: "public",
                perUserRpm: null,
                fallbackModelIds: [],
                disabledAt: null,
                disabledReason: null,
                bearerTokenCiphertext: await encryptSecret(
                    "sk_saved_token",
                    secret,
                ),
                ...communityEndpointPrices({ completionImagePrice: 0.03 }),
            };
        }

        const OPENAI_IMAGE_USAGE = {
            input_tokens: 12,
            output_tokens: 1056,
            total_tokens: 1068,
            input_tokens_details: { text_tokens: 12, image_tokens: 0 },
        };

        it("bills request-priced endpoints one image even when usage is returned", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () =>
                    Response.json({
                        data: [{ b64_json: "iVBORw0KGgo=" }],
                        usage: OPENAI_IMAGE_USAGE,
                    }),
                ),
            );

            const result = await callCommunityImageEndpoint(
                await imageEndpoint("request"),
                "a sprout",
                imageParams,
                secret,
            );
            expect(result.trackingData?.usage).toEqual({
                completionImageTokens: 1,
            });
        });

        it("bills token-priced endpoints with the provider-returned usage", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () =>
                    Response.json({
                        data: [{ b64_json: "iVBORw0KGgo=" }],
                        usage: OPENAI_IMAGE_USAGE,
                    }),
                ),
            );

            const result = await callCommunityImageEndpoint(
                await imageEndpoint("tokens"),
                "a sprout",
                imageParams,
                secret,
            );
            expect(result.trackingData?.usage).toEqual({
                promptTextTokens: 12,
                promptImageTokens: 0,
                completionImageTokens: 1056,
            });
        });

        it("fails token-priced endpoints that stop returning usage", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () =>
                    Response.json({
                        data: [{ b64_json: "iVBORw0KGgo=" }],
                    }),
                ),
            );

            await expect(
                callCommunityImageEndpoint(
                    await imageEndpoint("tokens"),
                    "a sprout",
                    imageParams,
                    secret,
                ),
            ).rejects.toMatchObject({
                status: 502,
                message: expect.stringContaining("image token usage"),
            });
        });

        it("forwards edits as multipart and bills provider image-token usage", async () => {
            const fetchMock = vi.fn(async (input, init) => {
                const request = new Request(input, init);
                if (request.url === TEST_INPUT_IMAGE_URL) {
                    return new Response(new Uint8Array(TEST_PNG_BYTES));
                }

                expect(request.url).toBe(
                    "https://api.example.com/v1/images/edits",
                );
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_saved_token",
                );
                expect(request.headers.get("content-type")).toContain(
                    "multipart/form-data",
                );
                const formData = await request.formData();
                expect(formData.get("model")).toBe("gpt-image-1");
                expect(formData.get("prompt")).toBe("make it blue");
                expect(formData.get("size")).toBe("1024x1024");
                expect(formData.get("quality")).toBe("medium");
                expect(formData.get("image")).toBeInstanceOf(File);

                return Response.json({
                    data: [{ b64_json: TEST_PNG_BASE64 }],
                    usage: {
                        input_tokens: 54,
                        output_tokens: 1056,
                        total_tokens: 1110,
                        input_tokens_details: {
                            text_tokens: 12,
                            image_tokens: 42,
                        },
                    },
                });
            });
            vi.stubGlobal("fetch", fetchMock);

            const result = await callCommunityImageEndpoint(
                await imageEndpoint("tokens"),
                "make it blue",
                { ...imageParams, image: [TEST_INPUT_IMAGE_URL] },
                secret,
            );

            expect(result.trackingData?.usage).toEqual({
                promptTextTokens: 12,
                promptImageTokens: 42,
                completionImageTokens: 1056,
            });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("preserves an upstream unsupported-edit error", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url === TEST_INPUT_IMAGE_URL) {
                        return new Response(new Uint8Array(TEST_PNG_BYTES));
                    }
                    return Response.json(
                        { error: { message: "Image edits are not supported" } },
                        { status: 405 },
                    );
                }),
            );

            await expect(
                callCommunityImageEndpoint(
                    await imageEndpoint("request"),
                    "make it blue",
                    { ...imageParams, image: [TEST_INPUT_IMAGE_URL] },
                    secret,
                ),
            ).rejects.toMatchObject({
                status: 405,
                message: expect.stringContaining(
                    "Image edits are not supported",
                ),
            });
        });
    });

    it("builds Portkey gateway context with the saved token", async () => {
        const secret = "test-secret";
        const endpoint: CommunityEndpointRuntime = {
            kind: "external",
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "voodoohop/openai",
            name: "openai",
            title: "OpenAI",
            description: null,
            modality: "text",
            imagePricing: "request",
            inputModalities: null,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            visibility: "public",
            perUserRpm: null,
            delegatesGeneration: false,
            fallbackModelIds: [],
            disabledAt: null,
            disabledReason: null,
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                secret,
            ),
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        };
        const modelDefinition = communityModelDefinition(endpoint);

        const context = await communityEndpointGatewayContext(
            endpoint,
            modelDefinition,
            {
                messages: [{ role: "user", content: "hello" }],
                max_tokens: 5,
            },
            secret,
            "https://portkey.test",
            "sk_user_key",
        );

        expect(context).toMatchObject({
            max_tokens: 5,
            requestedModel: endpoint.modelId,
            portkeyGatewayUrl: "https://portkey.test",
            userApiKey: "sk_user_key",
            modelConfig: {
                provider: "openai",
                "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
                authKey: "sk_saved_token",
                model: "gpt-4.1-mini",
            },
        });
        expect(context.modelDef).toBe(modelDefinition);
        expect(context).not.toHaveProperty("messages");
    });

    describe("delegated agent endpoints", () => {
        const secret = "test-secret";

        async function agentEndpoint(
            overrides: Partial<ExternalCommunityEndpointRuntime> = {},
        ): Promise<ExternalCommunityEndpointRuntime> {
            return {
                kind: "external",
                id: "agent-endpoint-id",
                ownerUserId: "owner-id",
                modelId: "voodoohop/agent",
                name: "agent",
                title: "Agent",
                description: null,
                modality: "text",
                imagePricing: "request",
                inputModalities: null,
                baseUrl: "https://agent.example.com/v1",
                upstreamModel: "agent",
                visibility: "public",
                perUserRpm: null,
                delegatesGeneration: true,
                disabledAt: null,
                disabledReason: null,
                fallbackModelIds: [],
                bearerTokenCiphertext: await encryptSecret(
                    "sk_saved_token",
                    secret,
                ),
                ...communityEndpointPrices({}),
                ...overrides,
            };
        }

        async function contextFor(
            endpoint: CommunityEndpointRuntime,
            parentApiKeyId?: string,
        ) {
            return communityEndpointGatewayContext(
                endpoint,
                communityModelDefinition(endpoint),
                { messages: [{ role: "user", content: "make a video" }] },
                secret,
                "https://portkey.test",
                "sk_user_key",
                parentApiKeyId,
            );
        }

        it("authenticates as a run token, not the caller's or owner's key", async () => {
            const endpoint = await agentEndpoint();
            const context = await contextFor(endpoint, "parent-key-id");

            const token = String(context.modelConfig?.authKey);
            expect(token).toMatch(/^ag_/);
            expect(token).not.toContain("sk_user_key");
            // The owner's saved bearer is replaced, never sent alongside — the
            // endpoint must not receive a credential it could spend as its own.
            expect(token).not.toContain("sk_saved_token");

            const claims = await verifyAgentRunToken(token, secret);
            expect(claims).toMatchObject({ parentApiKeyId: "parent-key-id" });
        });

        it("sends the saved bearer when the endpoint is not flagged", async () => {
            const endpoint = await agentEndpoint({
                delegatesGeneration: false,
            });
            const context = await contextFor(endpoint, "parent-key-id");
            expect(context.modelConfig?.authKey).toBe("sk_saved_token");
        });

        it("always scopes managed agents to their agent id", async () => {
            const external = await agentEndpoint();
            const {
                bearerTokenCiphertext: _token,
                delegatesGeneration: _delegates,
                kind: _kind,
                ...base
            } = external;
            const endpoint: CommunityEndpointRuntime = {
                ...base,
                kind: "agent",
                agentId: "managed-agent-id",
                upstreamModel: "managed-agent-id",
            };
            const context = await contextFor(endpoint, "parent-key-id");
            const token = String(context.modelConfig?.authKey);
            const claims = await verifyAgentRunToken(token, secret);
            expect(claims).toMatchObject({
                parentApiKeyId: "parent-key-id",
                managedAgentId: "managed-agent-id",
            });
        });

        it("refuses to delegate when there is no key to bill", async () => {
            const endpoint = await agentEndpoint();
            await expect(contextFor(endpoint, undefined)).rejects.toThrow(
                "no API key to bill",
            );
        });

        it("refuses to delegate from an endpoint that charges a price", async () => {
            const endpoint = await agentEndpoint({
                ...communityEndpointPrices({ promptTextPrice: 0.1 }),
            });
            await expect(contextFor(endpoint, "parent-key-id")).rejects.toThrow(
                "is not free",
            );
        });
    });
});

fixtureTest(
    "routes chat completions through a registered community endpoint with its saved token",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `openai-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "OpenAI via community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "Bearer sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    upstreamModel: "gpt-4.1-mini",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: false,
                    },
                });

                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    // The upstream names itself, as a real provider does. Our
                    // id has to win over it, or a community model is recorded
                    // under whatever its owner happens to proxy.
                    model: "gpt-4.1-mini",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );

        expect(response.status).toBe(200);
        // Billing and analytics read the header, and it names OUR model even
        // though the upstream called itself something else.
        expect(response.headers.get("x-model-used")).toBe(modelId);
        const body = await response.json();
        // The OpenAI-compatible body still echoes the upstream's own name,
        // which is what a provider's response carries. It disagrees with the
        // header on purpose today; see the follow-up issue on aligning them.
        expect(body).toMatchObject({
            model: "gpt-4.1-mini",
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        });

        const legacyResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: legacyCommunityModelId(
                        ownerGithubUsername,
                        modelName,
                    ),
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );
        expect(legacyResponse.status).toBe(200);
        const legacyBody = await legacyResponse.json();
        expect(legacyBody).toMatchObject({
            model: "gpt-4.1-mini",
            choices: [{ message: { content: "ok" } }],
        });

        const upstreamCalls = fetchMock.mock.calls.filter(([input, init]) =>
            isPortkeyChatCompletionsRequest(new Request(input, init)),
        );
        expect(upstreamCalls).toHaveLength(2);
    },
);

fixtureTest(
    "a private model is owner-only and a zero-priced public model is free",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `private-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const endpointId = `endpoint-${crypto.randomUUID()}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
            // Owner-only private models have no Pollinations charge and remain
            // callable without a Pollinations balance.
            tierBalance: 0,
        });
        // A key belonging to the endpoint owner — its calls are owner calls.
        const { key: ownerApiKey } = await createTestApiKey({
            name: "owner-key",
            userId: ownerUserId,
        });
        await db.insert(communityEndpointTable).values({
            id: endpointId,
            ownerUserId,
            visibility: "private",
            name: modelName,
            description: "Private community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "Bearer sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            // A private endpoint is free (billed to its owner); prices are 0.
            promptTextPrice: 0,
            completionTextPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isPortkeyChatCompletionsRequest(request)) {
                return Response.json({
                    id: "chatcmpl_private",
                    object: "chat.completion",
                    model: "gpt-4.1-mini",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }
            if (isBillingFetch(request)) return Response.json({ data: [] });
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        // A non-owner caller: the private model resolves to "invalid model",
        // indistinguishable from an unknown name so it isn't discoverable.
        const otherResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(otherResponse.status).toBe(400);

        // The owner reaches their own private model.
        const ownerResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${ownerApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(ownerResponse.status).toBe(200);
        await expect(ownerResponse.json()).resolves.toMatchObject({
            choices: [{ message: { content: "ok" } }],
        });

        const catalogIncludesModel = async (authorization?: string) => {
            const modelsResponse = await fetchGen(
                new Request("https://gen.pollinations.ai/text/models", {
                    headers: authorization
                        ? { Authorization: `Bearer ${authorization}` }
                        : undefined,
                }),
            );
            expect(modelsResponse.status).toBe(200);
            const models = (await modelsResponse.json()) as { name: string }[];
            return models.some((model) => model.name === modelId);
        };

        // The owner's authenticated catalog includes the private model, while
        // anonymous and other authenticated callers cannot discover it.
        await expect(catalogIncludesModel(ownerApiKey)).resolves.toBe(true);
        await expect(catalogIncludesModel(apiKey)).resolves.toBe(false);
        await expect(catalogIncludesModel()).resolves.toBe(false);

        // Publishing the same zero-priced endpoint makes it globally callable
        // without requiring a Pollinations balance.
        await db
            .update(communityEndpointTable)
            .set({ visibility: "public" })
            .where(eq(communityEndpointTable.id, endpointId));
        resetGenerationModelRegistryCache();
        const { key: zeroBalanceCallerKey } = await createTestApiKey({
            user: { tierBalance: 0, packBalance: 0 },
        });
        const freePublicResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${zeroBalanceCallerKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "free public" }],
                }),
            }),
        );
        expect(freePublicResponse.status).toBe(200);
        await expect(freePublicResponse.json()).resolves.toMatchObject({
            choices: [{ message: { content: "ok" } }],
        });
    },
);

fixtureTest(
    "streams chat completions through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `stream-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Streaming community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (isPortkeyChatCompletionsRequest(request)) {
                    await expectCommunityPortkeyRequest(input, init, {
                        customHost: "https://api.example.com/v1",
                        bearerToken: "sk_saved_token",
                        upstreamModel: "gpt-4.1-mini",
                        body: {
                            messages: [{ role: "user", content: "hello" }],
                            max_tokens: 5,
                            stream: true,
                            stream_options: { include_usage: true },
                        },
                    });

                    return new Response(
                        [
                            'data: {"id":"upstream","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}',
                            "",
                            'data: {"id":"upstream","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[],"usage":{"prompt_tokens":999,"completion_tokens":999,"total_tokens":1998}}',
                            "",
                            "data: [DONE]",
                            "",
                        ].join("\n"),
                        {
                            headers: {
                                "Content-Type": "text/event-stream",
                            },
                        },
                    );
                }

                if (isBillingFetch(request)) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                    stream: true,
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const body = await response.text();
        expect(body).toContain('"model":"gpt-4.1-mini"');
        expect(body).not.toContain(`"model":"${modelId}"`);
        expect(body).toContain('"prompt_tokens":999');
        expect(body).toContain('"completion_tokens":999');
    },
);

fixtureTest(
    "adapts Responses requests through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `responses-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Responses community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);
                if (isPortkeyChatCompletionsRequest(request)) {
                    await expectCommunityPortkeyRequest(input, init, {
                        customHost: "https://api.example.com/v1",
                        bearerToken: "sk_saved_token",
                        upstreamModel: "gpt-4.1-mini",
                        body: {
                            messages: [{ role: "user", content: "hello" }],
                            max_tokens: 5,
                            stream: false,
                        },
                    });
                    return Response.json({
                        id: "chatcmpl_responses",
                        object: "chat.completion",
                        created: 1,
                        model: "gpt-4.1-mini",
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: "responses ok",
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 3,
                            total_tokens: 5,
                        },
                    });
                }
                if (isBillingFetch(request)) {
                    return Response.json({ data: [] });
                }
                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/responses", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    input: "hello",
                    max_output_tokens: 5,
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            object: "response",
            model: "gpt-4.1-mini",
            output_text: "responses ok",
            usage: {
                input_tokens: 2,
                output_tokens: 3,
                total_tokens: 5,
            },
        });
    },
);

fixtureTest(
    "routes simple text requests through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `simple-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Simple text community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (isPortkeyChatCompletionsRequest(request)) {
                    await expectCommunityPortkeyRequest(input, init, {
                        customHost: "https://api.example.com/v1",
                        bearerToken: "sk_saved_token",
                        upstreamModel: "gpt-4.1-mini",
                        body: {
                            messages: [{ role: "user", content: "hello" }],
                            max_tokens: 5,
                            stream: false,
                        },
                    });

                    return Response.json({
                        id: "chatcmpl_simple",
                        object: "chat.completion",
                        model: "gpt-4.1-mini",
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: "simple ok",
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 3,
                            total_tokens: 5,
                        },
                    });
                }

                if (isBillingFetch(request)) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await fetchGen(
            new Request(
                `https://gen.pollinations.ai/text/hello?model=${encodeURIComponent(
                    modelId,
                )}&max_tokens=5&stream=false`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(
            IMMUTABLE_CACHE_CONTROL,
        );
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(response.headers.get("x-cache-type")).toBeNull();
        expect(response.headers.get("x-cache-key")).toBeTruthy();
        await expect(response.text()).resolves.toBe("simple ok");
    },
);

fixtureTest(
    "lists registered community endpoints in public model catalogs",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `catalog-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Public community model",
            perUserRpm: 0.5,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const textResponse = await fetchGen(
            "https://gen.pollinations.ai/text/models",
        );
        const allResponse = await fetchGen(
            "https://gen.pollinations.ai/models",
        );
        const openaiResponse = await fetchGen(
            "https://gen.pollinations.ai/v1/models",
        );

        expect(textResponse.status).toBe(200);
        expect(allResponse.status).toBe(200);
        expect(openaiResponse.status).toBe(200);

        const textModels = (await textResponse.json()) as {
            name: string;
            aliases?: string[];
            category?: string;
            community?: boolean;
            per_user_rpm?: number | null;
            alpha?: boolean;
            description?: string;
            pricing?: Record<string, string>;
            baseUrl?: string;
            bearerTokenCiphertext?: string;
        }[];
        const allModels = (await allResponse.json()) as typeof textModels;
        const openaiModels = (await openaiResponse.json()) as {
            data: {
                id: string;
                supported_endpoints?: string[];
                per_user_rpm?: number | null;
            }[];
        };

        for (const models of [textModels, allModels]) {
            const listed = models.find((model) => model.name === modelId);
            expect(listed).toMatchObject({
                name: modelId,
                aliases: [
                    legacyCommunityModelId(ownerGithubUsername, modelName),
                ],
                category: "text",
                community: true,
                per_user_rpm: 0.5,
                alpha: true,
                title: "Public community model",
                description: "Public community model",
                pricing: {
                    currency: "pollen",
                    promptTextTokens: "0.0000001",
                    completionTextTokens: "0.0000002",
                },
            });
            expect(listed).not.toHaveProperty("baseUrl");
            expect(listed).not.toHaveProperty("bearerTokenCiphertext");
            expect(listed).not.toHaveProperty("agent");
        }

        expect(openaiModels.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: modelId,
                    per_user_rpm: 0.5,
                    supported_endpoints: expect.arrayContaining([
                        "/v1/chat/completions",
                        "/v1/responses",
                    ]),
                }),
            ]),
        );
    },
);

fixtureTest(
    "orders every model catalog for practical discovery",
    async ({ restrictedApiKey }) => {
        const ownerGithubUsername = `order-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const newestDate = new Date("2100-01-02T00:00:00Z");
        const tiedDate = new Date("2100-01-01T00:00:00Z");
        for (const [name, createdAt] of [
            ["newest", newestDate],
            ["a-tie", tiedDate],
            ["b-tie", tiedDate],
        ] as const) {
            await db.insert(communityEndpointTable).values({
                id: `endpoint-${crypto.randomUUID()}`,
                ownerUserId,
                visibility: "public",
                name,
                description: `Ordering test ${name}`,
                baseUrl: "https://api.example.com/v1",
                upstreamModel: "gpt-4.1-mini",
                bearerTokenCiphertext: await encryptSecret(
                    "sk_saved_token",
                    env.BETTER_AUTH_SECRET,
                ),
                promptTextPrice: 0,
                completionTextPrice: 0,
                createdAt,
                updatedAt: createdAt,
            });
        }

        const [allResponse, openaiResponse, textResponse, restrictedResponse] =
            await Promise.all([
                fetchGen("https://gen.pollinations.ai/models"),
                fetchGen("https://gen.pollinations.ai/v1/models"),
                fetchGen("https://gen.pollinations.ai/text/models"),
                fetchGen("https://gen.pollinations.ai/models", {
                    headers: {
                        Authorization: `Bearer ${restrictedApiKey}`,
                    },
                }),
            ]);

        expect(allResponse.status).toBe(200);
        expect(openaiResponse.status).toBe(200);
        expect(textResponse.status).toBe(200);
        expect(restrictedResponse.status).toBe(200);

        type ListedModel = {
            name: string;
            category: string;
            community?: boolean;
            alpha?: boolean;
            added_date?: number;
        };
        const allModels = (await allResponse.json()) as ListedModel[];
        const openaiModels = (await openaiResponse.json()) as {
            data: { id: string }[];
        };
        const textModels = (await textResponse.json()) as ListedModel[];
        const restrictedModels =
            (await restrictedResponse.json()) as ListedModel[];
        const officialModels = allModels.filter((model) => !model.community);
        const communityModels = allModels.filter((model) => model.community);
        const allNames = allModels.map((model) => model.name);

        expect(allNames).toEqual(openaiModels.data.map((model) => model.id));
        expect(textModels.map((model) => model.name)).toEqual(
            allModels
                .filter((model) => model.category === "text")
                .map((model) => model.name),
        );
        expect(allNames).toEqual([
            ...officialModels.map((model) => model.name),
            ...communityModels.map((model) => model.name),
        ]);

        const categoryOrder = [
            "text",
            "image",
            "video",
            "3d",
            "audio",
            "realtime",
            "embedding",
        ];
        expect([
            ...new Set(officialModels.map((model) => model.category)),
        ]).toEqual(
            categoryOrder.filter((category) =>
                officialModels.some((model) => model.category === category),
            ),
        );

        const defaults: Record<string, string> = {
            text: DEFAULT_TEXT_MODEL,
            image: DEFAULT_IMAGE_MODEL,
            "3d": DEFAULT_3D_MODEL,
            audio: DEFAULT_AUDIO_MODEL,
            realtime: DEFAULT_REALTIME_MODEL,
            embedding: DEFAULT_EMBEDDING_MODEL,
        };
        for (const category of categoryOrder) {
            const models = officialModels.filter(
                (model) => model.category === category,
            );
            const defaultModel = defaults[category];
            if (defaultModel !== undefined) {
                expect(models[0]?.name).toBe(defaultModel);
            }
            const remainingModels =
                defaultModel === undefined ? models : models.slice(1);
            expect(remainingModels).toEqual(
                [...remainingModels].sort(
                    (left, right) =>
                        Number(left.alpha === true) -
                            Number(right.alpha === true) ||
                        (right.added_date ?? 0) - (left.added_date ?? 0) ||
                        (left.name < right.name
                            ? -1
                            : left.name > right.name
                              ? 1
                              : 0),
                ),
            );
        }

        expect(communityModels.slice(0, 3)).toMatchObject([
            {
                name: communityModelId(ownerGithubUsername, "newest"),
                added_date: newestDate.getTime(),
            },
            {
                name: communityModelId(ownerGithubUsername, "a-tie"),
                added_date: tiedDate.getTime(),
            },
            {
                name: communityModelId(ownerGithubUsername, "b-tie"),
                added_date: tiedDate.getTime(),
            },
        ]);

        const restrictedNames = restrictedModels.map((model) => model.name);
        expect(restrictedNames).toEqual(
            allNames.filter((name) => restrictedNames.includes(name)),
        );
    },
);

fixtureTest(
    "excludes a deactivated community model from public model catalogs",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `disabled-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Deactivated community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            disabledAt: new Date(),
            disabledReason: "repeated upstream 500s",
            disabledBy: "monitor",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const textResponse = await fetchGen(
            "https://gen.pollinations.ai/text/models",
        );
        const allResponse = await fetchGen(
            "https://gen.pollinations.ai/models",
        );
        const openaiResponse = await fetchGen(
            "https://gen.pollinations.ai/v1/models",
        );

        const textModels = (await textResponse.json()) as { name: string }[];
        const allModels = (await allResponse.json()) as typeof textModels;
        const openaiModels = (await openaiResponse.json()) as {
            data: { id: string }[];
        };

        for (const models of [textModels, allModels]) {
            expect(
                models.find((model) => model.name === modelId),
            ).toBeUndefined();
        }
        expect(
            openaiModels.data.find((model) => model.id === modelId),
        ).toBeUndefined();
    },
);

fixtureTest(
    "filters model catalogs with ?community query parameter",
    async () => {
        const suffix = crypto.randomUUID().slice(0, 8);
        const textOwner = `filter-text-${suffix}`;
        const imageOwner = `filter-img-${suffix}`;
        const textName = `qp-text-${suffix}`;
        const imageName = `qp-img-${suffix}`;
        const textModelId = communityModelId(textOwner, textName);
        const imageModelId = communityModelId(imageOwner, imageName);

        const textUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: textOwner,
        });
        const imageUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: imageOwner,
        });

        await db.insert(communityEndpointTable).values([
            {
                id: `endpoint-${crypto.randomUUID()}`,
                ownerUserId: textUserId,
                visibility: "public",
                name: textName,
                description: "Community text filter test model",
                baseUrl: "https://api.example.com/v1",
                upstreamModel: "gpt-4.1-mini",
                bearerTokenCiphertext: await encryptSecret(
                    "sk_saved_token",
                    env.BETTER_AUTH_SECRET,
                ),
                promptTextPrice: 0,
                completionTextPrice: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: `endpoint-${crypto.randomUUID()}`,
                ownerUserId: imageUserId,
                visibility: "public",
                name: imageName,
                description: "Community image filter test model",
                modality: "image",
                baseUrl: "https://img.example.com/v1",
                upstreamModel: "flux-1",
                bearerTokenCiphertext: await encryptSecret(
                    "sk_saved_token",
                    env.BETTER_AUTH_SECRET,
                ),
                promptTextPrice: 0,
                completionTextPrice: 0,
                completionImagePrice: 0.01,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);

        type ListedModel = { name: string; community?: boolean };

        const [
            allDefault,
            allExclude,
            allOnly,
            textExclude,
            textOnly,
            openaiExclude,
            openaiOnly,
            imageExclude,
            imageOnly,
            allExcludeNumeric,
            allOnlyNumeric,
        ] = await Promise.all([
            SELF.fetch("https://gen.pollinations.ai/models"),
            SELF.fetch("https://gen.pollinations.ai/models?community=false"),
            SELF.fetch("https://gen.pollinations.ai/models?community=true"),
            SELF.fetch(
                "https://gen.pollinations.ai/text/models?community=false",
            ),
            SELF.fetch(
                "https://gen.pollinations.ai/text/models?community=true",
            ),
            SELF.fetch("https://gen.pollinations.ai/v1/models?community=false"),
            SELF.fetch("https://gen.pollinations.ai/v1/models?community=true"),
            SELF.fetch(
                "https://gen.pollinations.ai/image/models?community=false",
            ),
            SELF.fetch(
                "https://gen.pollinations.ai/image/models?community=true",
            ),
            SELF.fetch("https://gen.pollinations.ai/models?community=0"),
            SELF.fetch("https://gen.pollinations.ai/models?community=1"),
        ]);

        for (const r of [
            allDefault,
            allExclude,
            allOnly,
            textExclude,
            textOnly,
            openaiExclude,
            openaiOnly,
            imageExclude,
            imageOnly,
            allExcludeNumeric,
            allOnlyNumeric,
        ]) {
            expect(r.status).toBe(200);
        }

        const defaultModels = (await allDefault.json()) as ListedModel[];
        const excludeModels = (await allExclude.json()) as ListedModel[];
        const onlyModels = (await allOnly.json()) as ListedModel[];
        const textExcludeModels = (await textExclude.json()) as ListedModel[];
        const textOnlyModels = (await textOnly.json()) as ListedModel[];
        const openaiExcludeData = (await openaiExclude.json()) as {
            data: { id: string }[];
        };
        const openaiOnlyData = (await openaiOnly.json()) as {
            data: { id: string }[];
        };
        const imageExcludeModels = (await imageExclude.json()) as ListedModel[];
        const imageOnlyModels = (await imageOnly.json()) as ListedModel[];
        const excludeNumeric =
            (await allExcludeNumeric.json()) as ListedModel[];
        const onlyNumeric = (await allOnlyNumeric.json()) as ListedModel[];

        expect(defaultModels.some((m) => m.community)).toBe(true);
        expect(defaultModels.some((m) => !m.community)).toBe(true);

        expect(excludeModels.every((m) => !m.community)).toBe(true);
        expect(
            excludeModels.find((m) => m.name === textModelId),
        ).toBeUndefined();

        expect(onlyModels.every((m) => m.community === true)).toBe(true);
        expect(onlyModels.find((m) => m.name === textModelId)).toBeDefined();

        expect(textExcludeModels.every((m) => !m.community)).toBe(true);
        expect(textOnlyModels.every((m) => m.community === true)).toBe(true);

        expect(
            openaiExcludeData.data.find((m) => m.id === textModelId),
        ).toBeUndefined();
        expect(
            openaiOnlyData.data.find((m) => m.id === textModelId),
        ).toBeDefined();

        expect(imageExcludeModels.every((m) => !m.community)).toBe(true);
        expect(
            imageExcludeModels.find((m) => m.name === imageModelId),
        ).toBeUndefined();

        expect(imageOnlyModels.every((m) => m.community === true)).toBe(true);
        expect(
            imageOnlyModels.find((m) => m.name === imageModelId),
        ).toBeDefined();

        expect(excludeNumeric.map((m) => m.name)).toEqual(
            excludeModels.map((m) => m.name),
        );
        expect(onlyNumeric.map((m) => m.name)).toEqual(
            onlyModels.map((m) => m.name),
        );

        const invalidResponses = await Promise.all([
            SELF.fetch("https://gen.pollinations.ai/models?community=tru"),
            SELF.fetch("https://gen.pollinations.ai/models?community=yes"),
            SELF.fetch("https://gen.pollinations.ai/v1/models?community=2"),
            SELF.fetch(
                "https://gen.pollinations.ai/image/models?community=nope",
            ),
        ]);
        for (const r of invalidResponses) {
            expect(r.status).toBe(400);
        }
    },
);

fixtureTest(
    "rejects a direct chat completion against a deactivated community model",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `disabled-call-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const legacyModelId = legacyCommunityModelId(
            ownerGithubUsername,
            modelName,
        );
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Deactivated community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            disabledAt: new Date(),
            disabledReason: "repeated upstream 500s",
            disabledBy: "monitor",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        for (const requestedModel of [modelId, legacyModelId]) {
            const response = await fetchGen(
                "https://gen.pollinations.ai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: requestedModel,
                        messages: [{ role: "user", content: "hello" }],
                        stream: false,
                    }),
                },
            );

            expect(response.status).toBe(400);
            const body = (await response.json()) as {
                error?: { message?: string };
            };
            expect(body.error?.message).toContain("Invalid model or alias");
            expect(body.error?.message).not.toContain("repeated upstream 500s");
        }
    },
);

fixtureTest(
    "lets a non-allowlisted user register a private model but blocks publishing tools",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `denied-${crypto.randomUUID().slice(0, 8)}`;
        const privateModelName = `${modelName}-private`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        for (const probe of [
            {
                path: "models",
                body: {
                    baseUrl: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                },
            },
            {
                path: "test",
                body: {
                    baseUrl: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    model: "gpt-4.1-mini",
                },
            },
        ]) {
            const probeResponse = await fetchEnterApi(
                enterApi,
                new Request(
                    `http://localhost:3000/api/community-endpoints/${probe.path}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Cookie: await signedSessionCookie(sessionToken),
                        },
                        body: JSON.stringify(probe.body),
                    },
                ),
            );
            expect(probeResponse.status).toBe(403);
        }

        const directPublishResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: `${modelName}-direct-public`,
                    title: "Denied Public Endpoint",
                    description: "Denied public community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0.00001,
                    completionTextPrice: 0.00001,
                }),
            }),
        );
        expect(directPublishResponse.status).toBe(403);

        // Creation is open to everyone: a non-allowlisted user can register a
        // private model for their own use.
        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: privateModelName,
                    title: "Private Endpoint",
                    description: "Private community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                }),
            }),
        );
        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            visibility: string;
            promptTextPrice: number;
            completionTextPrice: number;
        };
        expect(registered).toMatchObject({
            visibility: "private",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        // Publishing is a separate, allowlist-gated action.
        const publishResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${registered.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: await signedSessionCookie(sessionToken),
                    },
                    body: JSON.stringify({
                        visibility: "public",
                        promptTextPrice: 0.00001,
                        completionTextPrice: 0.00001,
                    }),
                },
            ),
        );
        expect(publishResponse.status).toBe(403);

        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Denied community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    upstreamModel: "gpt-4.1-mini",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                    },
                });

                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    model: "gpt-4.1-mini",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const modelsResponse = await fetchGen(
            "https://gen.pollinations.ai/text/models",
        );
        expect(modelsResponse.status).toBe(200);
        const models = (await modelsResponse.json()) as { name: string }[];
        expect(models.some((model) => model.name === modelId)).toBe(true);

        const generationResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(generationResponse.status).toBe(200);
        await expect(generationResponse.json()).resolves.toMatchObject({
            model: "gpt-4.1-mini",
            choices: [
                {
                    message: { content: "ok" },
                },
            ],
        });
    },
);

fixtureTest(
    "registers a Pollinations-compatible endpoint through Enter API and uses it through gen",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `pollinations-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                const isPortkeyRequest =
                    request.headers.has("x-portkey-provider");
                if (!isPortkeyRequest) {
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer sk_pollinations_upstream",
                    );
                    await expect(request.json()).resolves.toMatchObject({
                        model: "openai",
                        messages: [{ role: "user", content: "Reply with OK." }],
                        stream: false,
                    });
                    return Response.json({
                        id: "chatcmpl_pollinations_upstream_test",
                        object: "chat.completion",
                        model: "openai",
                        choices: [
                            {
                                index: 0,
                                message: { role: "assistant", content: "OK" },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 3,
                            total_tokens: 5,
                        },
                    });
                }

                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://gen.pollinations.ai/v1",
                    bearerToken: "sk_pollinations_upstream",
                    upstreamModel: "openai",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: false,
                    },
                });

                return Response.json({
                    id: "chatcmpl_pollinations_upstream",
                    object: "chat.completion",
                    model: "openai",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: modelName,
                    title: "Pollinations Upstream",
                    description: "Pollinations upstream through community API",
                    baseUrl: "https://gen.pollinations.ai/v1",
                    upstreamModel: "openai",
                    bearerToken: "Bearer sk_pollinations_upstream",
                    visibility: "public",
                    promptTextPrice: 0.00001,
                    completionTextPrice: 0.00001,
                }),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            modelId: string;
            baseUrl: string;
            upstreamModel: string;
            visibility: string;
            promptTextPrice: number;
            completionTextPrice: number;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            baseUrl: "https://gen.pollinations.ai/v1",
            upstreamModel: "openai",
            visibility: "public",
            promptTextPrice: 0.00001,
            completionTextPrice: 0.00001,
        });

        const testResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: registered.baseUrl,
                    bearerToken: "Bearer sk_pollinations_upstream",
                    model: registered.upstreamModel,
                }),
            }),
        );
        expect(testResponse.status).toBe(200);
        await expect(testResponse.json()).resolves.toMatchObject({
            message: "Endpoint responded with usage",
            billableUsage: {
                promptTextTokens: 2,
                completionTextTokens: 3,
            },
        });

        const throttledTestResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: registered.baseUrl,
                    bearerToken: "Bearer sk_pollinations_upstream",
                    model: registered.upstreamModel,
                }),
            }),
        );
        expect(throttledTestResponse.status).toBe(429);
        expect(throttledTestResponse.headers.get("Retry-After")).toBe("30");
        await expect(throttledTestResponse.json()).resolves.toMatchObject({
            error: "rate_limited",
        });

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            model: "openai",
            choices: [{ message: { content: "ok" } }],
        });
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isPortkeyChatCompletionsRequest(new Request(input, init)),
            ),
        ).toHaveLength(2);
    },
);

fixtureTest(
    "registers an OpenAI-compatible image endpoint and exposes it through image APIs",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `image-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (
                request.url === TEST_INPUT_IMAGE_URL ||
                request.url.startsWith("data:image/png;base64,")
            ) {
                return new Response(new Uint8Array(TEST_PNG_BYTES), {
                    headers: { "Content-Type": "image/png" },
                });
            }

            if (request.url === TEST_COMMUNITY_IMAGE_URL) {
                expect(request.headers.get("authorization")).toBeNull();
                expect(request.redirect).toBe("manual");
                return new Response(new Uint8Array(TEST_PNG_BYTES), {
                    headers: { "Content-Type": "image/png" },
                });
            }

            if (isCommunityImageGenerationsRequest(request)) {
                const body = (await request.clone().json()) as Record<
                    string,
                    unknown
                >;
                await expectCommunityImageGenerationsRequest(input, init, {
                    bearerToken: "sk_image_upstream",
                    body: { model: "gpt-image-1", n: 1 },
                });

                if (
                    body.prompt ===
                    "A simple green sprout icon on a white background."
                ) {
                    expect(body).toMatchObject({
                        size: "1024x1024",
                        quality: "medium",
                    });
                } else if (body.prompt === "green sprout") {
                    expect(body).toMatchObject({
                        size: "512x768",
                        quality: "medium",
                        background: "transparent",
                        output_format: "png",
                    });
                } else if (body.prompt === "blue flower") {
                    expect(body).toMatchObject({
                        size: "1024x1024",
                        quality: "high",
                    });
                } else if (body.prompt !== "invalid media") {
                    throw new Error(
                        `Unexpected image prompt: ${String(body.prompt)}`,
                    );
                }

                return Response.json({
                    created: 1,
                    data: [
                        body.prompt === "invalid media"
                            ? { b64_json: TEST_INVALID_IMAGE_BASE64 }
                            : { url: TEST_COMMUNITY_IMAGE_URL },
                    ],
                });
            }

            if (isCommunityImageEditsRequest(request)) {
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_image_upstream",
                );
                expect(request.headers.get("content-type")).toContain(
                    "multipart/form-data",
                );
                const formData = await request.formData();
                expect(formData.get("model")).toBe("gpt-image-1");
                expect(formData.get("n")).toBe("1");
                expect(formData.get("image")).toBeInstanceOf(File);

                const prompt = formData.get("prompt");
                if (prompt === "make it blue") {
                    expect(formData.get("size")).toBe("512x512");
                    expect(formData.get("quality")).toBe("high");
                } else if (prompt === "turn it red") {
                    expect(formData.get("size")).toBe("384x640");
                    expect(formData.get("quality")).toBe("medium");
                } else if (prompt === "Add a small blue dot to the image.") {
                    expect(formData.get("size")).toBe("1024x1024");
                    expect(formData.get("quality")).toBe("medium");
                } else {
                    throw new Error(
                        `Unexpected edit prompt: ${String(prompt)}`,
                    );
                }

                return Response.json({
                    created: 1,
                    data: [{ b64_json: TEST_PNG_BASE64 }],
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const registrationPayload = {
            name: modelName,
            title: "Community Image Endpoint",
            description: "OpenAI-compatible image endpoint",
            modality: "image",
            inputModalities: ["text", "image"],
            visibility: "public",
            baseUrl: "https://api.example.com/v1/images/generations",
            upstreamModel: "gpt-image-1",
            bearerToken: "Bearer sk_image_upstream",
            promptTextPrice: 0.000002,
            completionImagePrice: 0.03,
        };
        const unsupportedInputResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    ...registrationPayload,
                    name: `${modelName}-invalid`,
                    inputModalities: ["text", "audio"],
                }),
            }),
        );
        expect(unsupportedInputResponse.status).toBe(400);

        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify(registrationPayload),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            modelId: string;
            modality: string;
            inputModalities: string[];
            baseUrl: string;
            upstreamModel: string;
            promptTextPrice: number;
            completionImagePrice: number;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            modality: "image",
            inputModalities: ["text", "image"],
            baseUrl: "https://api.example.com/v1/images/generations",
            upstreamModel: "gpt-image-1",
            promptTextPrice: 0,
            completionImagePrice: 0.03,
        });

        const testResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: registered.baseUrl,
                    bearerToken: "Bearer sk_image_upstream",
                    model: registered.upstreamModel,
                    modality: "image",
                }),
            }),
        );
        expect(testResponse.status).toBe(200);
        await expect(testResponse.json()).resolves.toMatchObject({
            message:
                "Generation and editing endpoints responded with image data",
            usage: { images: 1 },
            billableUsage: { completionImageTokens: 1 },
            inputModalities: ["text", "image"],
        });

        const simpleImageResponse = await fetchGen(
            new Request(
                `https://gen.pollinations.ai/image/green%20sprout?model=${encodeURIComponent(
                    registered.modelId,
                )}&width=512&height=768&transparent=true`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            ),
        );
        expect(simpleImageResponse.status).toBe(200);
        expect(simpleImageResponse.headers.get("content-type")).toBe(
            "image/png",
        );
        expect(simpleImageResponse.headers.get("x-model-used")).toBe(
            registered.modelId,
        );
        expect(
            simpleImageResponse.headers.get("x-usage-prompt-text-tokens"),
        ).toBeNull();
        expect(
            simpleImageResponse.headers.get("x-usage-completion-image-tokens"),
        ).toBe("1");
        expect(
            Array.from(new Uint8Array(await simpleImageResponse.arrayBuffer())),
        ).toEqual(TEST_PNG_BYTES);

        const openaiImageResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "blue flower",
                    size: "1024x1024",
                    quality: "hd",
                    response_format: "b64_json",
                }),
            }),
        );
        expect(openaiImageResponse.status).toBe(200);
        await expect(openaiImageResponse.json()).resolves.toMatchObject({
            data: [{ b64_json: TEST_PNG_BASE64 }],
            usage: {
                input_tokens: 0,
                output_tokens: 1,
                total_tokens: 1,
                input_tokens_details: {
                    text_tokens: 0,
                    image_tokens: 0,
                },
            },
        });

        const editFormData = new FormData();
        editFormData.append("model", registered.modelId);
        editFormData.append("prompt", "make it blue");
        editFormData.append("size", "512x512");
        editFormData.append("quality", "hd");
        editFormData.append(
            "image",
            new Blob([new Uint8Array(TEST_PNG_BYTES)], { type: "image/png" }),
            "source.png",
        );
        const openaiEditResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: editFormData,
            }),
        );
        expect(openaiEditResponse.status).toBe(200);
        await expect(openaiEditResponse.json()).resolves.toMatchObject({
            data: [{ b64_json: TEST_PNG_BASE64 }],
            usage: {
                input_tokens: 0,
                output_tokens: 1,
                total_tokens: 1,
            },
        });

        const simpleEditResponse = await fetchGen(
            new Request(
                `https://gen.pollinations.ai/image/turn%20it%20red?model=${encodeURIComponent(
                    registered.modelId,
                )}&image=${encodeURIComponent(TEST_INPUT_IMAGE_URL)}&width=384&height=640`,
                { headers: { Authorization: `Bearer ${apiKey}` } },
            ),
        );
        expect(simpleEditResponse.status).toBe(200);
        expect(simpleEditResponse.headers.get("content-type")).toBe(
            "image/png",
        );
        expect(
            simpleEditResponse.headers.get("x-usage-completion-image-tokens"),
        ).toBe("1");
        expect(
            Array.from(new Uint8Array(await simpleEditResponse.arrayBuffer())),
        ).toEqual(TEST_PNG_BYTES);

        const urlImageResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "blue flower",
                    quality: "hd",
                    response_format: "url",
                }),
            }),
        );
        expect(urlImageResponse.status).toBe(200);
        await expect(urlImageResponse.json()).resolves.toMatchObject({
            data: [
                {
                    url: expect.stringContaining(
                        `/image/blue%20flower?model=${encodeURIComponent(registered.modelId)}`,
                    ),
                },
            ],
        });

        const invalidMediaResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "invalid media",
                }),
            }),
        );
        expect(invalidMediaResponse.status).toBe(502);

        const imageModelsResponse = await fetchGen(
            "https://gen.pollinations.ai/image/models",
        );
        const textModelsResponse = await fetchGen(
            "https://gen.pollinations.ai/text/models",
        );
        const allModelsResponse = await fetchGen(
            "https://gen.pollinations.ai/models",
        );
        const openaiModelsResponse = await fetchGen(
            "https://gen.pollinations.ai/v1/models",
        );

        expect(imageModelsResponse.status).toBe(200);
        expect(textModelsResponse.status).toBe(200);
        expect(allModelsResponse.status).toBe(200);
        expect(openaiModelsResponse.status).toBe(200);

        const imageModels = (await imageModelsResponse.json()) as {
            name: string;
            category?: string;
            community?: boolean;
            input_modalities?: string[];
            flat_rate?: boolean;
            pricing?: Record<string, string>;
        }[];
        const textModels = (await textModelsResponse.json()) as {
            name: string;
        }[];
        const allModels =
            (await allModelsResponse.json()) as typeof imageModels;
        const openaiModels = (await openaiModelsResponse.json()) as {
            data: {
                id: string;
                input_modalities?: string[];
                supported_endpoints?: string[];
            }[];
        };

        const listedImage = imageModels.find(
            (model) => model.name === registered.modelId,
        );
        expect(listedImage).toMatchObject({
            name: registered.modelId,
            category: "image",
            community: true,
            input_modalities: ["text", "image"],
            flat_rate: true,
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.03",
            },
        });
        expect(
            textModels.find((model) => model.name === registered.modelId),
        ).toBeUndefined();
        expect(
            allModels.filter((model) => model.name === registered.modelId),
        ).toHaveLength(1);

        const openaiModel = openaiModels.data.find(
            (model) => model.id === registered.modelId,
        );
        expect(openaiModel?.input_modalities).toEqual(["text", "image"]);
        expect(openaiModel?.supported_endpoints).toEqual(
            expect.arrayContaining([
                "/v1/images/generations",
                "/v1/images/edits",
                "/image/{prompt}",
            ]),
        );
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isCommunityImageGenerationsRequest(new Request(input, init)),
            ),
        ).toHaveLength(5);
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isCommunityImageEditsRequest(new Request(input, init)),
            ),
        ).toHaveLength(3);
        expect(
            fetchMock.mock.calls.filter(
                ([input, init]) =>
                    new Request(input, init).url === TEST_COMMUNITY_IMAGE_URL,
            ),
        ).toHaveLength(4);

        const maximumImagePriceResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${registered.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: await signedSessionCookie(sessionToken),
                    },
                    body: JSON.stringify({
                        completionImagePrice: MAX_COMMUNITY_PRICE_PER_IMAGE,
                    }),
                },
            ),
        );
        expect(maximumImagePriceResponse.status).toBe(200);

        const excessiveImagePriceResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${registered.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: await signedSessionCookie(sessionToken),
                    },
                    body: JSON.stringify({
                        completionImagePrice:
                            MAX_COMMUNITY_PRICE_PER_IMAGE + 0.01,
                    }),
                },
            ),
        );
        expect(excessiveImagePriceResponse.status).toBe(400);
    },
);

fixtureTest(
    "manages my-models through account API with a key that has account keys permission",
    async () => {
        const ownerGithubUsername = `pk-${crypto.randomUUID().slice(0, 8)}`;
        const { key } = await createTestApiKey({
            type: "publishable",
            accountPermissions: ["keys"],
            user: {
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
                githubUsername: ownerGithubUsername,
            },
        });
        const denied = await createTestApiKey({
            user: {
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
                githubUsername: `denied-${crypto.randomUUID().slice(0, 8)}`,
            },
        });
        const enterApi = await createEnterFrontendApi();

        const legacyResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(legacyResponse.status).toBe(404);

        const deniedResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${denied.key}`,
                },
            }),
        );
        expect(deniedResponse.status).toBe(403);

        const listResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(listResponse.status).toBe(200);
        await expect(listResponse.json()).resolves.toEqual({
            data: [],
            provider: { name: null, url: null },
        });

        const incompleteProviderResponse = await fetchEnterApi(
            enterApi,
            new Request(
                "http://localhost:3000/api/account/my-models/provider",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ name: "Example AI", url: "" }),
                },
            ),
        );
        expect(incompleteProviderResponse.status).toBe(400);

        const insecureProviderResponse = await fetchEnterApi(
            enterApi,
            new Request(
                "http://localhost:3000/api/account/my-models/provider",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: "Example AI",
                        url: "http://example.com",
                    }),
                },
            ),
        );
        expect(insecureProviderResponse.status).toBe(400);

        const providerResponse = await fetchEnterApi(
            enterApi,
            new Request(
                "http://localhost:3000/api/account/my-models/provider",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: "Example AI",
                        url: "https://example.com",
                    }),
                },
            ),
        );
        expect(providerResponse.status).toBe(200);
        await expect(providerResponse.json()).resolves.toEqual({
            name: "Example AI",
            url: "https://example.com/",
        });

        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "my-test-model",
                    title: "My Test Model",
                    description: "Account API model",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    perUserRpm: 0.5,
                }),
            }),
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as Record<
            string,
            unknown
        >;
        expect(created).toMatchObject({
            modelId: `${ownerGithubUsername}/my-test-model`,
            name: "my-test-model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            visibility: "private",
            perUserRpm: 0.5,
            promptTextPrice: 0,
            completionTextPrice: 0,
            disabled: false,
            disabledReason: null,
            disabledAt: null,
        });
        expect(created).not.toHaveProperty("bearerToken");
        expect(created).not.toHaveProperty("bearerTokenCiphertext");
        expect(typeof created.id).toBe("string");
        const createdId = created.id as string;
        await db
            .update(communityEndpointTable)
            .set({
                disabledAt: new Date(),
                disabledReason: "was failing",
                disabledBy: "monitor",
            })
            .where(eq(communityEndpointTable.id, createdId));

        const updateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        title: "Updated Model Title",
                        description: "Updated description",
                        visibility: "public",
                        promptTextPrice: 0.00001,
                        completionTextPrice: 0.00002,
                    }),
                },
            ),
        );
        expect(updateResponse.status).toBe(200);
        await expect(updateResponse.json()).resolves.toMatchObject({
            title: "Updated Model Title",
            description: "Updated description",
            visibility: "public",
            promptTextPrice: 0.00001,
            completionTextPrice: 0.00002,
            disabled: true,
            disabledReason: "was failing",
        });

        const reactivateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ active: true }),
                },
            ),
        );
        expect(reactivateResponse.status).toBe(200);
        await expect(reactivateResponse.json()).resolves.toMatchObject({
            disabled: false,
            disabledReason: null,
            disabledAt: null,
        });

        const deactivateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ active: false }),
                },
            ),
        );
        expect(deactivateResponse.status).toBe(200);
        await expect(deactivateResponse.json()).resolves.toMatchObject({
            disabled: true,
            disabledReason: "Deactivated by owner",
        });

        // Minimum-price policy is independent of visibility: any non-negative
        // owner price is accepted by this API.
        const tinyPriceResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: 1e-12 }),
                },
            ),
        );
        expect(tinyPriceResponse.status).toBe(200);
        await expect(tinyPriceResponse.json()).resolves.toMatchObject({
            promptTextPrice: 1e-12,
        });

        const negativePriceResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: -1e-12 }),
                },
            ),
        );
        expect(negativePriceResponse.status).toBe(400);

        // Partial updates persist the full effective visibility + price set,
        // so a price-only patch keeps the other stored prices intact.
        const priceOnlyResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: 0.00003 }),
                },
            ),
        );
        expect(priceOnlyResponse.status).toBe(200);
        await expect(priceOnlyResponse.json()).resolves.toMatchObject({
            visibility: "public",
            promptTextPrice: 0.00003,
            completionTextPrice: 0.00002,
        });

        // Making the model private clears all owner-set prices.
        const privatizeResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ visibility: "private" }),
                },
            ),
        );
        expect(privatizeResponse.status).toBe(200);
        await expect(privatizeResponse.json()).resolves.toMatchObject({
            visibility: "private",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        // Republishing without prices is allowed: zero makes the public model
        // explicitly free while publishing remains allowlist-gated.
        const republishResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ visibility: "public" }),
                },
            ),
        );
        expect(republishResponse.status).toBe(200);
        await expect(republishResponse.json()).resolves.toMatchObject({
            visibility: "public",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        const secondListResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(secondListResponse.status).toBe(200);
        const secondList = (await secondListResponse.json()) as {
            data: Record<string, unknown>[];
            provider: { name: string | null; url: string | null };
        };
        expect(secondList.data).toHaveLength(1);
        expect(secondList.provider).toEqual({
            name: "Example AI",
            url: "https://example.com/",
        });
        expect(secondList.data[0]).toMatchObject({
            title: "Updated Model Title",
            perUserRpm: 0.5,
        });
        expect(secondList.data[0]).not.toHaveProperty("bearerToken");
        expect(secondList.data[0]).not.toHaveProperty("bearerTokenCiphertext");

        const registryEntry = (
            await getCommunityModelRegistryEntries(env)
        ).find((entry) => entry.id === `${ownerGithubUsername}/my-test-model`);
        expect(registryEntry?.info).toMatchObject({
            brand: "Example AI",
            brand_url: "https://example.com/",
        });
        expect(registryEntry?.communityEndpoint.perUserRpm).toBe(0.5);

        const clearLimitResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ perUserRpm: null }),
                },
            ),
        );
        expect(clearLimitResponse.status).toBe(200);
        await expect(clearLimitResponse.json()).resolves.toMatchObject({
            perUserRpm: null,
        });
    },
);

fixtureTest(
    "accepts free and minimum public community prices while rejecting smaller positive prices",
    async () => {
        const ownerGithubUsername = `price-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const cookie = await signedSessionCookie(sessionToken);
        const enterApi = await createEnterCommunityApi();
        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: "price-floor-test",
                    title: "Price Floor Test",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0,
                }),
            }),
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as {
            id: string;
            promptTextPrice: number;
        };
        expect(created.promptTextPrice).toBe(0);

        const updatePrice = (price: number) =>
            fetchEnterApi(
                enterApi,
                new Request(
                    `http://localhost:3000/api/community-endpoints/${created.id}/update`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Cookie: cookie,
                        },
                        body: JSON.stringify({ promptTextPrice: price }),
                    },
                ),
            );

        const minimumResponse = await updatePrice(
            MIN_COMMUNITY_PRICE_PER_TOKEN,
        );
        expect(minimumResponse.status).toBe(200);
        await expect(minimumResponse.json()).resolves.toMatchObject({
            promptTextPrice: MIN_COMMUNITY_PRICE_PER_TOKEN,
        });

        const maximumResponse = await updatePrice(
            MAX_COMMUNITY_PRICE_PER_TOKEN,
        );
        expect(maximumResponse.status).toBe(200);
        await expect(maximumResponse.json()).resolves.toMatchObject({
            promptTextPrice: MAX_COMMUNITY_PRICE_PER_TOKEN,
        });

        const aboveMaximumResponse = await updatePrice(
            MAX_COMMUNITY_PRICE_PER_TOKEN * 1.01,
        );
        expect(aboveMaximumResponse.status).toBe(400);
        expect(await aboveMaximumResponse.text()).toContain(
            `${MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS} Pollen per 1M tokens`,
        );

        const belowMinimumResponse = await updatePrice(
            MIN_COMMUNITY_PRICE_PER_TOKEN / 10,
        );
        expect(belowMinimumResponse.status).toBe(400);
        expect(await belowMinimumResponse.text()).toContain(
            `${MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS} per 1M tokens`,
        );

        const negativeResponse = await updatePrice(
            -MIN_COMMUNITY_PRICE_PER_TOKEN,
        );
        expect(negativeResponse.status).toBe(400);
    },
);

fixtureTest(
    "rejects an endpoint probe when the upstream responds with a redirect",
    async () => {
        // Use an approved publisher so the request reaches the outbound probe;
        // non-allowlisted accounts are rejected before any fetch occurs.
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: `redir-${crypto.randomUUID().slice(0, 8)}`,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (
                request.url ===
                "https://redirecting.example.com/v1/chat/completions"
            ) {
                // The redirect target never went through base-URL validation,
                // so the probe must not follow it.
                expect(init?.redirect).toBe("manual");
                return new Response(null, {
                    status: 302,
                    headers: { Location: "http://127.0.0.1/admin" },
                });
            }
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const testResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: "https://redirecting.example.com/v1",
                    bearerToken: "Bearer sk_upstream",
                    model: "gpt-test",
                }),
            }),
        );

        expect(testResponse.status).toBe(400);
        expect(await testResponse.text()).toContain("redirect");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    },
);

fixtureTest("rejects unsafe community model names", async () => {
    const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: ownerGithubUsername,
    });
    const sessionToken = `session-${crypto.randomUUID()}`;
    await db.insert(sessionTable).values({
        id: `session-${crypto.randomUUID()}`,
        token: sessionToken,
        userId: ownerUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const enterApi = await createEnterCommunityApi();
    for (const name of [
        "inferenceport.ai/gpt-oss-20b",
        "bad name",
        "bad'name",
        "$(bad)",
    ]) {
        const response = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name,
                    title: "Unsafe Name",
                    description: "unsafe model name",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-oss-20b",
                    bearerToken: "sk_saved_token",
                }),
            }),
        );

        expect(response.status).toBe(400);
    }
});

fixtureTest(
    "rejects community registration unless exactly one of baseUrl or agentId is provided",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const cookie = await signedSessionCookie(sessionToken);
        const register = (body: Record<string, unknown>) =>
            fetchEnterApi(
                enterApi,
                new Request("http://localhost:3000/api/community-endpoints", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: cookie,
                    },
                    body: JSON.stringify({
                        name: `bee-${crypto.randomUUID().slice(0, 8)}`,
                        title: "Registration Test",
                        bearerToken: "sk_saved_token",
                        ...body,
                    }),
                }),
            );

        const both = await register({
            baseUrl: "https://api.example.com/v1",
            agentId: crypto.randomUUID(),
        });
        expect(both.status).toBe(400);

        const neither = await register({});
        expect(neither.status).toBe(400);
    },
);

fixtureTest(
    "creates, edits, registers, and deletes managed agents",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `model-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterEnv = {
            ...env,
            BETTER_AUTH_URL: "https://enter.test",
            AGENT_RUNTIME_BASE_URL: env.AGENT_RUNTIME_BASE_URL,
        };
        const enterApi = await createEnterFrontendApi();
        const cookie = (await signedSessionCookie(sessionToken)).replace(
            "better-auth.session_token",
            "__Secure-better-auth.session_token",
        );
        const promptAgent = {
            systemPrompt: "You are a terse SQL tutor.",
            baseModel: "openai-fast",
            mcpServers: ["pollinations"],
        };
        const createAgentResponse = await fetchEnterApi(
            enterApi,
            new Request("https://enter.test/api/account/agents", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify(promptAgent),
            }),
            enterEnv,
        );
        expect(createAgentResponse.status).toBe(200);
        const agent = (await createAgentResponse.json()) as {
            id: string;
            systemPrompt: string;
            baseModel: string;
            mcpServers: string[];
        };
        expect(agent).toMatchObject({
            systemPrompt: "You are a terse SQL tutor.",
            baseModel: "openai-fast",
            mcpServers: ["pollinations"],
        });
        expect(agent).not.toHaveProperty("apiKeyId");
        expect(agent).not.toHaveProperty("apiKeyCiphertext");
        expect(agent).not.toHaveProperty("bearerTokenCiphertext");
        expect(agent).not.toHaveProperty("baseUrl");
        const [storedAgent] = await db
            .select()
            .from(agentTable)
            .where(eq(agentTable.id, agent.id));
        expect(storedAgent.id).toBe(agent.id);
        expect(JSON.parse(storedAgent.config)).toEqual(promptAgent);
        const partialUpdateResponse = await fetchEnterApi(
            enterApi,
            new Request(`https://enter.test/api/account/agents/${agent.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    systemPrompt: "You are an editable SQL tutor.",
                }),
            }),
            enterEnv,
        );
        expect(partialUpdateResponse.status).toBe(400);
        const updateAgentResponse = await fetchEnterApi(
            enterApi,
            new Request(`https://enter.test/api/account/agents/${agent.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    ...promptAgent,
                    systemPrompt: "You are an editable SQL tutor.",
                }),
            }),
            enterEnv,
        );
        expect(updateAgentResponse.status).toBe(200);
        await expect(updateAgentResponse.json()).resolves.toMatchObject({
            id: agent.id,
            systemPrompt: "You are an editable SQL tutor.",
            mcpServers: ["pollinations"],
        });
        const [agentAfterPromptUpdate] = await db
            .select()
            .from(agentTable)
            .where(eq(agentTable.id, agent.id));
        expect(JSON.parse(agentAfterPromptUpdate.config)).toEqual({
            ...promptAgent,
            systemPrompt: "You are an editable SQL tutor.",
        });
        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("https://enter.test/api/account/my-models", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: modelName,
                    title: "Managed SQL Tutor",
                    agentId: agent.id,
                    visibility: "public",
                    promptTextPrice: 0.00001,
                    completionTextPrice: 0.00002,
                }),
            }),
            enterEnv,
        );
        expect(registerResponse.status).toBe(400);
        const fallbackRegisterResponse = await fetchEnterApi(
            enterApi,
            new Request("https://enter.test/api/account/my-models", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: modelName,
                    title: "Managed SQL Tutor",
                    agentId: agent.id,
                    fallbackModelIds: ["owner/backup"],
                }),
            }),
            enterEnv,
        );
        expect(fallbackRegisterResponse.status).toBe(400);
        expect(await fallbackRegisterResponse.text()).toContain(
            "do not support fallback models",
        );
        const freeRegisterResponse = await fetchEnterApi(
            enterApi,
            new Request("https://enter.test/api/account/my-models", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: modelName,
                    title: "Managed SQL Tutor",
                    agentId: agent.id,
                    visibility: "public",
                }),
            }),
            enterEnv,
        );
        expect(freeRegisterResponse.status).toBe(200);
        const registration = (await freeRegisterResponse.json()) as {
            id: string;
            modelId: string;
            agentId: string | null;
            baseUrl: string;
        };
        expect(registration.id).not.toBe(agent.id);
        expect(registration.agentId).toBe(agent.id);
        expect(registration.baseUrl).toBe(enterEnv.AGENT_RUNTIME_BASE_URL);
        const paidUpdateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `https://enter.test/api/account/my-models/${registration.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: cookie,
                    },
                    body: JSON.stringify({ promptTextPrice: 0.00001 }),
                },
            ),
            enterEnv,
        );
        expect(paidUpdateResponse.status).toBe(400);
        const fallbackUpdateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `https://enter.test/api/account/my-models/${registration.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: cookie,
                    },
                    body: JSON.stringify({
                        fallbackModelIds: ["owner/backup"],
                    }),
                },
            ),
            enterEnv,
        );
        expect(fallbackUpdateResponse.status).toBe(400);
        expect(await fallbackUpdateResponse.text()).toContain(
            "do not support fallback models",
        );
        const fallbackCandidatesResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `https://enter.test/api/account/my-models/${registration.id}/fallback-candidates`,
                { headers: { Cookie: cookie } },
            ),
            enterEnv,
        );
        expect(fallbackCandidatesResponse.status).toBe(200);
        await expect(fallbackCandidatesResponse.json()).resolves.toEqual({
            data: [],
        });
        const registryEntry = (
            await getCommunityModelRegistryEntries(env)
        ).find((entry) => entry.id === registration.modelId);
        expect(registryEntry?.communityEndpoint).toMatchObject({
            kind: "agent",
            baseUrl: env.AGENT_RUNTIME_BASE_URL,
            agentId: agent.id,
            upstreamModel: agent.id,
        });
        // An agent listing carries no upstream credential of its own.
        expect(registryEntry?.communityEndpoint).not.toHaveProperty(
            "bearerTokenCiphertext",
        );
        if (!registryEntry) throw new Error("Agent listing was not registered");
        expect(registryEntry.agentConfig).toEqual({
            baseModel: promptAgent.baseModel,
            mcpServers: ["pollinations"],
        });
        expect(registryEntry.definition.cost).toMatchObject({
            promptTextTokens: 0,
            completionTextTokens: 0,
        });
        const gatewayContext = await communityEndpointGatewayContext(
            registryEntry.communityEndpoint,
            registryEntry.definition,
            { messages: [{ role: "user", content: "hello" }] },
            env.BETTER_AUTH_SECRET,
            env.PORTKEY_GATEWAY_URL,
            "sk_user_key",
            "caller-api-key-id",
        );
        const runtimeToken = String(gatewayContext.modelConfig?.authKey);
        expect(runtimeToken).toMatch(/^ag_/);
        await expect(
            verifyAgentRunToken(runtimeToken, env.BETTER_AUTH_SECRET),
        ).resolves.toMatchObject({
            parentApiKeyId: "caller-api-key-id",
            managedAgentId: agent.id,
        });
        expect(gatewayContext.modelConfig).toMatchObject({
            "custom-host": env.AGENT_RUNTIME_BASE_URL,
            model: agent.id,
        });

        const [modelsResponse, openaiModelsResponse] = await Promise.all([
            fetchGen("https://gen.pollinations.ai/models"),
            fetchGen("https://gen.pollinations.ai/v1/models"),
        ]);
        const models = (await modelsResponse.json()) as {
            name: string;
            community?: boolean;
            agent?: boolean;
            base_model?: string;
            pricing?: Record<string, string>;
            capabilities?: string[];
            input_modalities?: string[];
            output_modalities?: string[];
        }[];
        const openaiModels = (await openaiModelsResponse.json()) as {
            data: {
                id: string;
                agent?: boolean;
                base_model?: string;
                pricing?: Record<string, string>;
                capabilities?: string[];
                input_modalities?: string[];
                output_modalities?: string[];
                tools?: boolean;
                reasoning?: boolean;
                context_length?: number;
            }[];
        };
        const baseModelInfo = models.find(
            (model) => model.name === promptAgent.baseModel,
        );
        const agentModelInfo = models.find(
            (model) => model.name === registration.modelId,
        );
        expect(baseModelInfo).toBeDefined();
        const agentCapabilities = [
            ...(baseModelInfo?.capabilities ?? []),
            "pollinations_models",
        ];
        expect(agentModelInfo).toMatchObject({
            community: true,
            agent: true,
            base_model: promptAgent.baseModel,
            pricing: baseModelInfo?.pricing,
            capabilities: agentCapabilities,
            input_modalities: baseModelInfo?.input_modalities,
            output_modalities: baseModelInfo?.output_modalities,
        });
        const openaiBaseModel = openaiModels.data.find(
            (model) => model.id === promptAgent.baseModel,
        );
        const openaiAgentModel = openaiModels.data.find(
            (model) => model.id === registration.modelId,
        );
        expect(openaiBaseModel).toBeDefined();
        expect(openaiAgentModel).toMatchObject({
            agent: true,
            base_model: promptAgent.baseModel,
            pricing: baseModelInfo?.pricing,
            capabilities: agentCapabilities,
            input_modalities: openaiBaseModel?.input_modalities,
            output_modalities: openaiBaseModel?.output_modalities,
            tools: openaiBaseModel?.tools,
            context_length: openaiBaseModel?.context_length,
        });

        const duplicateRegistrationResponse = await fetchEnterApi(
            enterApi,
            new Request("https://enter.test/api/account/my-models", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: `${modelName}-duplicate`,
                    title: "Duplicate Managed Agent",
                    agentId: agent.id,
                }),
            }),
            enterEnv,
        );
        expect(duplicateRegistrationResponse.status).toBe(400);

        const deleteRegisteredAgentResponse = await fetchEnterApi(
            enterApi,
            new Request(`https://enter.test/api/account/agents/${agent.id}`, {
                method: "DELETE",
                headers: { Cookie: cookie },
            }),
            enterEnv,
        );
        expect(deleteRegisteredAgentResponse.status).toBe(200);
        await expect(
            db.select().from(agentTable).where(eq(agentTable.id, agent.id)),
        ).resolves.toEqual([]);
        await expect(
            db
                .select()
                .from(communityEndpointTable)
                .where(eq(communityEndpointTable.id, registration.id)),
        ).resolves.toEqual([]);
    },
);

fixtureTest("validates community fallback targets on write", async () => {
    const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: ownerGithubUsername,
    });
    const otherOwnerGithubUsername = `other-${crypto.randomUUID().slice(0, 8)}`;
    const otherOwnerUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: otherOwnerGithubUsername,
    });
    const sessionToken = `session-${crypto.randomUUID()}`;
    await db.insert(sessionTable).values({
        id: `session-${crypto.randomUUID()}`,
        token: sessionToken,
        userId: ownerUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const bearerTokenCiphertext = await encryptSecret(
        "sk_saved_token",
        env.BETTER_AUTH_SECRET,
    );
    const targetNames = {
        cheap: `cheap-${crypto.randomUUID().slice(0, 8)}`,
        priv: `private-${crypto.randomUUID().slice(0, 8)}`,
        otherPrivate: `other-private-${crypto.randomUUID().slice(0, 8)}`,
        disabled: `disabled-${crypto.randomUUID().slice(0, 8)}`,
        delegating: `delegating-${crypto.randomUUID().slice(0, 8)}`,
        image: `image-${crypto.randomUUID().slice(0, 8)}`,
        pricey: `pricey-${crypto.randomUUID().slice(0, 8)}`,
    };
    for (const target of [
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: targetNames.cheap,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "cheap-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.1 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId: otherOwnerUserId,
            visibility: "private",
            name: targetNames.otherPrivate,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "other-private-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0,
            completionTextPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: targetNames.disabled,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "disabled-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0,
            completionTextPrice: 0,
            disabledAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "private",
            name: targetNames.priv,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "private-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0,
            completionTextPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: targetNames.delegating,
            baseUrl: "https://agent.example.com/v1",
            upstreamModel: "delegating-upstream",
            bearerTokenCiphertext,
            delegatesGeneration: true,
            promptTextPrice: 0,
            completionTextPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: targetNames.image,
            modality: "image",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "image-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0,
            completionTextPrice: 0,
            completionImagePrice: 0.01,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: targetNames.pricey,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "pricey-upstream",
            bearerTokenCiphertext,
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.5 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ] satisfies (typeof communityEndpointTable.$inferInsert)[]) {
        await db.insert(communityEndpointTable).values(target);
    }

    const enterApi = await createEnterCommunityApi();
    const primaryName = `primary-${crypto.randomUUID().slice(0, 8)}`;
    const createWithFallback = async (
        name: string,
        ...fallbackModelIds: string[]
    ) =>
        fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name,
                    title: "Primary",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "primary-upstream",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0.2 / 1_000_000,
                    completionTextPrice: 0.2 / 1_000_000,
                    fallbackModelIds,
                }),
            }),
        );

    const selfReference = await createWithFallback(
        primaryName,
        communityModelId(ownerGithubUsername, primaryName),
    );
    expect(selfReference.status).toBe(400);
    expect(await selfReference.text()).toContain(
        "Fallback target cannot be the model itself",
    );

    const missing = await createWithFallback(
        primaryName,
        communityModelId(ownerGithubUsername, "does-not-exist"),
    );
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("does not exist");

    const privateTarget = await createWithFallback(
        `${primaryName}-private`,
        communityModelId(ownerGithubUsername, targetNames.priv),
    );
    expect(privateTarget.status).toBe(200);
    await expect(privateTarget.json()).resolves.toMatchObject({
        fallbackModelIds: [
            communityModelId(ownerGithubUsername, targetNames.priv),
        ],
    });

    const otherPrivateTarget = await createWithFallback(
        `${primaryName}-other-private`,
        communityModelId(otherOwnerGithubUsername, targetNames.otherPrivate),
    );
    expect(otherPrivateTarget.status).toBe(400);
    expect(await otherPrivateTarget.text()).toContain(
        "must be public or owned by you",
    );

    const disabledTarget = await createWithFallback(
        `${primaryName}-disabled`,
        communityModelId(ownerGithubUsername, targetNames.disabled),
    );
    expect(disabledTarget.status).toBe(400);
    expect(await disabledTarget.text()).toContain("must be active");

    const delegatingTarget = await createWithFallback(
        `${primaryName}-delegating`,
        communityModelId(ownerGithubUsername, targetNames.delegating),
    );
    expect(delegatingTarget.status).toBe(400);
    expect(await delegatingTarget.text()).toContain(
        "cannot delegate generation",
    );

    const wrongModality = await createWithFallback(
        `${primaryName}-modality`,
        communityModelId(ownerGithubUsername, targetNames.image),
    );
    expect(wrongModality.status).toBe(400);
    expect(await wrongModality.text()).toContain("is a image model, not text");

    const overPriced = await createWithFallback(
        `${primaryName}-price`,
        communityModelId(ownerGithubUsername, targetNames.pricey),
    );
    expect(overPriced.status).toBe(400);
    const overPricedMessage = await overPriced.text();
    expect(overPricedMessage).toContain("completionTextPrice");
    expect(overPricedMessage).toContain("exceeds this model's");
    // Only the offending field is named — promptTextPrice is within budget.
    expect(overPricedMessage).not.toContain("promptTextPrice");

    const cheapModelId = communityModelId(
        ownerGithubUsername,
        targetNames.cheap,
    );
    const accepted = await createWithFallback(primaryName, cheapModelId);
    expect(accepted.status).toBe(200);
    const created = (await accepted.json()) as {
        id: string;
        modelId: string;
        fallbackModelIds: string[];
    };
    expect(created.fallbackModelIds).toEqual([cheapModelId]);

    // One bad id fails the whole list, so a partial order is never stored.
    const partiallyBad = await createWithFallback(
        `${primaryName}-partial`,
        cheapModelId,
        communityModelId(ownerGithubUsername, "does-not-exist"),
    );
    expect(partiallyBad.status).toBe(400);
    expect(await partiallyBad.text()).toContain("does not exist");

    const duplicated = await createWithFallback(
        `${primaryName}-dup`,
        cheapModelId,
        cheapModelId,
    );
    expect(duplicated.status).toBe(400);
    expect(await duplicated.text()).toContain("listed more than once");

    // The dashboard's dropdown is built from this list, so anything it offers
    // must be acceptable to the update endpoint above — same rule, one function.
    const candidates = await fetchEnterApi(
        enterApi,
        new Request(
            `http://localhost:3000/api/community-endpoints/${created.id}/fallback-candidates`,
            { headers: { Cookie: await signedSessionCookie(sessionToken) } },
        ),
    );
    expect(candidates.status).toBe(200);
    const { data: eligible } = (await candidates.json()) as { data: string[] };
    expect(eligible).toContain(cheapModelId);
    expect(eligible).toContain(
        communityModelId(ownerGithubUsername, targetNames.priv),
    );
    // Never itself, and never a target the write path would reject.
    expect(eligible).not.toContain(created.modelId);
    for (const rejected of [
        targetNames.image,
        targetNames.pricey,
        targetNames.disabled,
        targetNames.delegating,
    ]) {
        expect(eligible).not.toContain(
            communityModelId(ownerGithubUsername, rejected),
        );
    }

    // An empty array clears the stored targets.
    const cleared = await fetchEnterApi(
        enterApi,
        new Request(
            `http://localhost:3000/api/community-endpoints/${created.id}/update`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({ fallbackModelIds: [] }),
            },
        ),
    );
    expect(cleared.status).toBe(200);
    await expect(cleared.json()).resolves.toMatchObject({
        fallbackModelIds: [],
    });
});

fixtureTest(
    "links community fallback targets in the generation registry",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const bearerTokenCiphertext = await encryptSecret(
            "sk_saved_token",
            env.BETTER_AUTH_SECRET,
        );
        const managedAgentId = crypto.randomUUID();
        await db.insert(agentTable).values({
            id: managedAgentId,
            ownerUserId,
            config: JSON.stringify({
                version: 1,
                kind: "prompt",
                systemPrompt: "Use the available tools.",
                baseModel: "openai",
                mcpServers: [],
            }),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const suffix = crypto.randomUUID().slice(0, 8);
        const name = (label: string) => `${label}-${suffix}`;
        const id = (label: string) =>
            communityModelId(ownerGithubUsername, name(label));
        const endpoint = (
            label: string,
            values: Partial<typeof communityEndpointTable.$inferInsert>,
        ) => ({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public" as const,
            name: name(label),
            baseUrl: "https://api.example.com/v1",
            upstreamModel: `${label}-upstream`,
            bearerTokenCiphertext,
            promptTextPrice: 0.2 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...values,
        });

        // Inserted one at a time: D1 caps the bound variables per statement.
        for (const row of [
            endpoint("valid-primary", {
                fallbackModelIds: [id("valid-target")],
            }),
            endpoint("valid-target", {
                promptTextPrice: 0.1 / 1_000_000,
                completionTextPrice: 0.1 / 1_000_000,
            }),
            endpoint("disabled-primary", {
                fallbackModelIds: [id("disabled-target")],
            }),
            endpoint("disabled-target", {
                disabledAt: new Date(),
                disabledReason: "repeated upstream 500s",
            }),
            endpoint("deleted-primary", {
                fallbackModelIds: [
                    communityModelId(ownerGithubUsername, "never-existed"),
                ],
            }),
            endpoint("repriced-primary", {
                fallbackModelIds: [id("repriced-target")],
            }),
            // Priced above its primary since the fallback was configured.
            endpoint("repriced-target", {
                completionTextPrice: 0.5 / 1_000_000,
            }),
            endpoint("delegating-primary", {
                fallbackModelIds: [id("delegating-target")],
            }),
            endpoint("delegating-target", {
                delegatesGeneration: true,
                promptTextPrice: 0,
                completionTextPrice: 0,
            }),
            endpoint("managed-primary", {
                baseUrl: null,
                agentId: managedAgentId,
                bearerTokenCiphertext: null,
                fallbackModelIds: [id("valid-target")],
                promptTextPrice: 0,
                completionTextPrice: 0,
            }),
            endpoint("second-target", {
                promptTextPrice: 0.1 / 1_000_000,
                completionTextPrice: 0.1 / 1_000_000,
            }),
            endpoint("third-target", {
                promptTextPrice: 0.1 / 1_000_000,
                completionTextPrice: 0.1 / 1_000_000,
            }),
            endpoint("fourth-target", {
                promptTextPrice: 0.1 / 1_000_000,
                completionTextPrice: 0.1 / 1_000_000,
            }),
            endpoint("multi-primary", {
                fallbackModelIds: [id("valid-target"), id("second-target")],
                // Its own targets declare fallbacks too; none of them may leak
                // into this model's routing.
            }),
            endpoint("greedy-primary", {
                fallbackModelIds: [
                    id("valid-target"),
                    id("second-target"),
                    id("third-target"),
                    id("fourth-target"),
                ],
            }),
            endpoint("gappy-primary", {
                fallbackModelIds: [
                    id("valid-target"),
                    communityModelId(ownerGithubUsername, "never-existed"),
                    id("second-target"),
                ],
            }),
            endpoint("image-primary", {
                modality: "image",
                imagePricing: "request",
                promptTextPrice: 0,
                completionTextPrice: 0,
                completionImagePrice: 0.02,
                fallbackModelIds: [id("image-target")],
            }),
            endpoint("image-target", {
                modality: "image",
                imagePricing: "request",
                promptTextPrice: 0,
                completionTextPrice: 0,
                completionImagePrice: 0.01,
            }),
            endpoint("image-request-primary", {
                modality: "image",
                imagePricing: "request",
                promptTextPrice: 0,
                completionTextPrice: 0,
                // 0.02 Pollen per generated image.
                completionImagePrice: 0.02,
                fallbackModelIds: [id("image-tokens-target")],
            }),
            // Switched itself to token pricing after being picked as a target:
            // the same column now means Pollen per token (0.00005 = the 50
            // Pollen/1M cap), so the raw numbers are no longer comparable and
            // a 1568-token image would bill 0.0784 against a 0.02 quote.
            endpoint("image-tokens-target", {
                modality: "image",
                imagePricing: "tokens",
                promptTextPrice: 0,
                completionTextPrice: 0,
                completionImagePrice: 0.00005,
            }),
        ]) {
            await db.insert(communityEndpointTable).values(row);
        }

        resetGenerationModelRegistryCache();
        const registry = await getGenerationModelRegistry(env);

        const fallbackIds = (model: string) =>
            registry.resolve(model)?.fallbackEntries?.map((e) => e.id);

        expect(fallbackIds(id("valid-primary"))).toEqual([id("valid-target")]);
        expect(fallbackIds(id("disabled-primary"))).toBeUndefined();
        expect(fallbackIds(id("deleted-primary"))).toBeUndefined();
        expect(fallbackIds(id("repriced-primary"))).toBeUndefined();
        expect(fallbackIds(id("delegating-primary"))).toBeUndefined();
        expect(fallbackIds(id("managed-primary"))).toBeUndefined();

        // Same image pricing mode on both sides: the price columns mean the
        // same thing, so the link stands.
        expect(fallbackIds(id("image-primary"))).toEqual([id("image-target")]);
        // Different modes: comparing per-image against per-token prices is
        // meaningless, so the link is dropped rather than billed across units.
        expect(fallbackIds(id("image-request-primary"))).toBeUndefined();

        // The declared list is kept in order, and only what this owner
        // declared: a target's own list is never appended.
        expect(fallbackIds(id("multi-primary"))).toEqual([
            id("valid-target"),
            id("second-target"),
        ]);
        // Over the cap: the extras are dropped rather than the request
        // spending an unbounded number of upstream timeouts.
        expect(fallbackIds(id("greedy-primary"))).toEqual([
            id("valid-target"),
            id("second-target"),
            id("third-target"),
        ]);
        // A dead id in the middle is skipped, keeping the survivors' order.
        expect(fallbackIds(id("gappy-primary"))).toEqual([
            id("valid-target"),
            id("second-target"),
        ]);
    },
);

fixtureTest(
    "uses the served model's transform for a registry fallback",
    async ({ apiKey }) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        const ownerGithubUsername = `transform-owner-${suffix}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const fallbackModelId = communityModelId(
            ownerGithubUsername,
            `plain-${suffix}`,
        );

        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: `plain-${suffix}`,
            baseUrl: "https://plain.example.com/v1",
            upstreamModel: "plain-upstream",
            bearerTokenCiphertext: await encryptSecret(
                "sk_plain_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.1 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const source = getRegistryModelDefinition("qwen-coder");
        const previousFallbacks = source.fallbacks;
        try {
            source.fallbacks = [fallbackModelId];
            resetGenerationModelRegistryCache();

            const messageRoles: string[][] = [];
            vi.stubGlobal(
                "fetch",
                vi.fn(async (input, init) => {
                    const request = new Request(input, init);
                    if (isPortkeyChatCompletionsRequest(request)) {
                        const body = (await request.json()) as {
                            messages: { role: string }[];
                        };
                        messageRoles.push(
                            body.messages.map((message) => message.role),
                        );
                        if (
                            request.headers.get("x-portkey-custom-host") !==
                            "https://plain.example.com/v1"
                        ) {
                            return Response.json(
                                { error: { message: "rate limited" } },
                                { status: 429 },
                            );
                        }
                        return Response.json({
                            id: "chatcmpl_fallback_transform",
                            object: "chat.completion",
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: "assistant",
                                        content: "ok",
                                    },
                                    finish_reason: "stop",
                                },
                            ],
                            usage: {
                                prompt_tokens: 1,
                                completion_tokens: 1,
                                total_tokens: 2,
                            },
                        });
                    }
                    if (isBillingFetch(request)) {
                        return Response.json({ data: [] });
                    }
                    throw new Error(`Unexpected fetch: ${request.url}`);
                }),
            );

            const response = await fetchGen(
                new Request("https://gen.pollinations.ai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "qwen-coder",
                        messages: [{ role: "user", content: "hello" }],
                    }),
                }),
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("x-model-used")).toBe(fallbackModelId);
            expect(messageRoles).toEqual([["system", "user"], ["user"]]);
        } finally {
            source.fallbacks = previousFallbacks;
            resetGenerationModelRegistryCache();
        }
    },
);

fixtureTest(
    "serves a failed community model from its fallback and bills the fallback",
    async ({ apiKey }) => {
        const {
            primaryModelId,
            fallbackModelId,
            primaryHost,
            fallbackHost,
            primaryUpstreamModel,
            fallbackUpstreamModel,
            primaryToken,
            fallbackToken,
        } = await createCommunityFallbackPair({
            prefix: "text-success",
            fallbackPerUserRpm: 1,
        });

        // Read inside the mock: request bodies cannot cross isolates.
        const gatewayCalls: {
            customHost: string | null;
            bearerToken: string | null;
            upstreamModel: string | null;
        }[] = [];
        const ingestedEvents: Record<string, unknown>[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isPortkeyChatCompletionsRequest(request)) {
                const customHost = request.headers.get("x-portkey-custom-host");
                gatewayCalls.push({
                    customHost,
                    bearerToken: request.headers.get("authorization"),
                    upstreamModel: request.headers.get("x-portkey-model"),
                });
                // The primary is rate limited — the failure the fallback exists
                // for.
                if (customHost === primaryHost) {
                    return Response.json(
                        { error: { message: "rate limited" } },
                        { status: 429 },
                    );
                }
                return Response.json({
                    id: "chatcmpl_fallback",
                    object: "chat.completion",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }
            if (isBillingFetch(request)) {
                if (new URL(request.url).pathname === "/v0/events") {
                    ingestedEvents.push(
                        ...parseIngestedEvents(await request.text()),
                    );
                }
                return Response.json({ data: [] });
            }
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const request = (content: string) =>
            fetchGen(
                new Request("https://gen.pollinations.ai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: primaryModelId,
                        messages: [{ role: "user", content }],
                    }),
                }),
            );

        const response = await request("hello-first");

        expect(response.status).toBe(200);
        expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[1]",
        );
        // The served model, not the requested one, is reported as used.
        expect(response.headers.get("x-model-used")).toBe(fallbackModelId);

        // Each endpoint is called once, in the order the owner declared, and
        // each attempt carries only its own endpoint's credential.
        expect(gatewayCalls).toEqual([
            {
                customHost: primaryHost,
                bearerToken: `Bearer ${primaryToken}`,
                upstreamModel: primaryUpstreamModel,
            },
            {
                customHost: fallbackHost,
                bearerToken: `Bearer ${fallbackToken}`,
                upstreamModel: fallbackUpstreamModel,
            },
        ]);

        // Two rows for the one request: the primary's failure, unbilled, and the
        // model that served. Without the first, a model rescued on every request
        // reads as healthy. The 429 is recorded as the 502 the caller would have
        // seen, so it counts as a server error rather than the caller's fault.
        await vi.waitFor(() => expect(ingestedEvents).toHaveLength(2));
        expect(
            ingestedEvents.map((event) => [
                event.modelUsed,
                event.responseStatus,
                event.isBilledUsage,
            ]),
        ).toContainEqual([primaryModelId, 502, false]);
        expect(
            ingestedEvents.map((event) => [
                event.modelUsed,
                event.responseStatus,
                event.isBilledUsage,
            ]),
        ).toContainEqual([fallbackModelId, 200, true]);
        // Both rows belong to the same request, so the pair can be joined.
        expect(
            new Set(ingestedEvents.map((event) => event.requestId)).size,
        ).toBe(1);

        const limitedResponse = await request("hello-second");
        expect(limitedResponse.status).toBe(429);
        expect(limitedResponse.headers.get("Retry-After")).toBeTruthy();
        await expect(limitedResponse.json()).resolves.toMatchObject({
            error: { code: "community_model_rate_limit" },
        });
        // The primary was attempted again, but its limited fallback was not.
        expect(gatewayCalls).toHaveLength(3);
        expect(gatewayCalls[2]?.customHost).toBe(primaryHost);
    },
);

fixtureTest(
    "names the model that failed last when every candidate fails",
    async ({ apiKey }) => {
        const { primaryModelId, fallbackModelId } =
            await createCommunityFallbackPair({
                prefix: "text-all-fail",
            });

        const ingestedEvents: Record<string, unknown>[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isPortkeyChatCompletionsRequest(request)) {
                // Nothing rescues this request: every endpoint is rate limited.
                return Response.json(
                    { error: { message: "rate limited" } },
                    { status: 429 },
                );
            }
            if (isBillingFetch(request)) {
                if (new URL(request.url).pathname === "/v0/events") {
                    ingestedEvents.push(
                        ...parseIngestedEvents(await request.text()),
                    );
                }
                return Response.json({ data: [] });
            }
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: primaryModelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );

        expect(response.status).toBe(502);

        // Two upstream calls, two rows, and each names the model it reached.
        // The row that records how the request ended must name the fallback:
        // naming the primary would count it twice and leave a permanently
        // broken fallback invisible in every per-model view.
        // A 5xx also emits an unrelated server-error event to Tinybird, so
        // narrow to the generation rows.
        const generationRows = () =>
            ingestedEvents.filter((event) => "requestId" in event);
        await vi.waitFor(() => expect(generationRows()).toHaveLength(2));
        expect(
            generationRows().map((event) => [
                event.modelUsed,
                event.isFinal,
                event.isBilledUsage,
            ]),
        ).toEqual(
            expect.arrayContaining([
                [primaryModelId, false, false],
                [fallbackModelId, true, false],
            ]),
        );
        // Both rows belong to the same request, so the pair can be joined.
        expect(
            new Set(generationRows().map((event) => event.requestId)).size,
        ).toBe(1);
    },
);

fixtureTest(
    "retries a failed community image endpoint against its fallback",
    async ({ apiKey }) => {
        const {
            primaryModelId,
            fallbackModelId,
            primaryHostname,
            fallbackHostname,
        } = await createCommunityFallbackPair({
            prefix: "image-retry",
            modality: "image",
            primaryName: "primary-image",
            fallbackName: "cheap-image",
        });

        const upstreamHosts: string[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isCommunityImageGenerationsRequest(request)) {
                const host = new URL(request.url).host;
                upstreamHosts.push(host);
                if (host === primaryHostname) {
                    return Response.json(
                        { error: "upstream down" },
                        {
                            status: 500,
                        },
                    );
                }
                return Response.json({
                    created: 1,
                    data: [{ b64_json: TEST_PNG_BASE64 }],
                });
            }
            if (isBillingFetch(request)) return Response.json({ data: [] });
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await fetchGen(
            new Request(
                `https://gen.pollinations.ai/image/green%20sprout?model=${encodeURIComponent(primaryModelId)}`,
                { headers: { Authorization: `Bearer ${apiKey}` } },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(upstreamHosts).toEqual([primaryHostname, fallbackHostname]);
        expect(response.headers.get("x-model-used")).toBe(fallbackModelId);
        expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[1]",
        );
        expect(
            Array.from(new Uint8Array(await response.arrayBuffer())),
        ).toEqual(TEST_PNG_BYTES);
    },
);

fixtureTest(
    "tries every declared image fallback and bills the model that served",
    async ({ apiKey }) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        const owners = ["one", "two", "three"].map(
            (label) => `chain-${label}-${suffix}`,
        );
        const userIds: string[] = [];
        for (const owner of owners) {
            userIds.push(
                await createTestUser({
                    githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
                    githubUsername: owner,
                }),
            );
        }
        const bearerTokenCiphertext = await encryptSecret(
            "sk_image_upstream",
            env.BETTER_AUTH_SECRET,
        );
        // Descending prices, as the same-or-lower rule requires of every target.
        const prices = [0.03, 0.02, 0.01];
        const modelIds = owners.map((owner, index) =>
            communityModelId(owner, `chain-image-${index}`),
        );

        for (const [index, owner] of owners.entries()) {
            await db.insert(communityEndpointTable).values({
                id: `endpoint-${crypto.randomUUID()}`,
                ownerUserId: userIds[index],
                visibility: "public" as const,
                name: `chain-image-${index}`,
                modality: "image",
                baseUrl: `https://${owner}.example.com/v1`,
                upstreamModel: `${owner}-upstream`,
                bearerTokenCiphertext,
                promptTextPrice: 0,
                completionTextPrice: 0,
                completionImagePrice: prices[index],
                // The primary declares BOTH fallbacks itself; neither target
                // declares anything, so nothing but this list is followed.
                ...(index === 0
                    ? { fallbackModelIds: [modelIds[1], modelIds[2]] }
                    : {}),
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }

        const upstreamHosts: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);
                if (isCommunityImageGenerationsRequest(request)) {
                    const host = new URL(request.url).host;
                    upstreamHosts.push(host);
                    // Only the last link works, so a 200 proves both hops ran.
                    if (host !== `${owners[2]}.example.com`) {
                        return Response.json(
                            { error: "upstream down" },
                            { status: 500 },
                        );
                    }
                    return Response.json({
                        created: 1,
                        data: [{ b64_json: TEST_PNG_BASE64 }],
                    });
                }
                if (isBillingFetch(request)) return Response.json({ data: [] });
                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await fetchGen(
            new Request(
                `https://gen.pollinations.ai/image/green%20sprout?model=${encodeURIComponent(modelIds[0])}`,
                { headers: { Authorization: `Bearer ${apiKey}` } },
            ),
        );

        expect(response.status).toBe(200);
        // In declared order, each endpoint contacted exactly once — no model
        // is ever retried against itself.
        expect(upstreamHosts).toEqual(
            owners.map((owner) => `${owner}.example.com`),
        );
        expect(response.headers.get("x-model-used")).toBe(modelIds[2]);
        expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[2]",
        );
        expect(
            Array.from(new Uint8Array(await response.arrayBuffer())),
        ).toEqual(TEST_PNG_BYTES);

        // The OpenAI-compatible route replaces the generated response with
        // JSON, so it has to carry the fallback marker across itself —
        // otherwise tracking reads the rescue as a plain first-try success.
        const openaiResponse = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelIds[0],
                    prompt: "green sprout",
                }),
            }),
        );

        expect(openaiResponse.status).toBe(200);
        expect(openaiResponse.headers.get("x-model-used")).toBe(modelIds[2]);
        expect(openaiResponse.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[2]",
        );
    },
);

fixtureTest(
    "does not replay image caller errors or moderation refusals on the fallback",
    async ({ apiKey }) => {
        const { primaryModelId, primaryHostname } =
            await createCommunityFallbackPair({
                prefix: "image-strict",
                modality: "image",
                primaryName: "strict-image",
                fallbackName: "loose-image",
            });
        let upstreamHosts: string[] = [];
        let primaryFailure = {
            status: 400,
            body: { error: { message: "size must be at most 1536x1536" } },
        };
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isCommunityImageGenerationsRequest(request)) {
                const host = new URL(request.url).host;
                upstreamHosts.push(host);
                if (host === primaryHostname) {
                    return Response.json(primaryFailure.body, {
                        status: primaryFailure.status,
                    });
                }
                return Response.json({
                    created: 1,
                    data: [{ b64_json: TEST_PNG_BASE64 }],
                });
            }
            if (isBillingFetch(request)) return Response.json({ data: [] });
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const generate = async () => {
            const response = await fetchGen(
                new Request(
                    `https://gen.pollinations.ai/image/green%20sprout?model=${encodeURIComponent(primaryModelId)}`,
                    { headers: { Authorization: `Bearer ${apiKey}` } },
                ),
            );
            // Drain before asserting: an unread body keeps the isolate alive.
            await response.arrayBuffer();
            return response;
        };

        // A caller error cannot succeed on a replay: the fallback is never
        // called and the primary's own 400 reaches the client.
        const callerError = await generate();
        expect(callerError.status).toBe(400);
        expect(upstreamHosts).toEqual([primaryHostname]);

        // A moderation refusal must not be routed around, whatever status the
        // provider wrapped it in — it stays a 422 content-policy rejection.
        upstreamHosts = [];
        primaryFailure = {
            status: 500,
            body: {
                error: { message: "Prompt flagged by our content filter" },
            },
        };
        const moderationRefusal = await generate();
        expect(moderationRefusal.status).toBe(422);
        expect(upstreamHosts).toEqual([primaryHostname]);
    },
);

fixtureTest(
    "does not serve a fallback the API key is not allowed to use",
    async () => {
        const { primaryModelId, fallbackModelId, primaryHost } =
            await createCommunityFallbackPair({
                prefix: "scoped",
            });

        // Scoped to the primary only — calling the fallback directly is a 403.
        const { key } = await createTestApiKey({
            allowedModels: [primaryModelId],
            user: { tierBalance: 100 },
        });

        const gatewayCalls: {
            config: string | null;
            provider: string | null;
            customHost: string | null;
        }[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isPortkeyChatCompletionsRequest(request)) {
                gatewayCalls.push({
                    config: request.headers.get("x-portkey-config"),
                    provider: request.headers.get("x-portkey-provider"),
                    customHost: request.headers.get("x-portkey-custom-host"),
                });
                return Response.json({
                    id: "chatcmpl_primary",
                    object: "chat.completion",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }
            if (isBillingFetch(request)) return Response.json({ data: [] });
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: primaryModelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(gatewayCalls).toHaveLength(1);
        // No strategy/targets config: the request runs against the primary
        // alone, so the key can never be served the model it cannot call.
        expect(gatewayCalls[0].config).toBeNull();
        expect(gatewayCalls[0].provider).toBe("openai");
        expect(gatewayCalls[0].customHost).toBe(primaryHost);

        // The same key calling the fallback directly is refused.
        const direct = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: fallbackModelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(direct.status).toBe(403);
    },
);
