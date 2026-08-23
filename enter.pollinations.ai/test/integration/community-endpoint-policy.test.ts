import { env, SELF } from "cloudflare:test";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    parseListingPayload,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { deriveCreateProxyPolicy } from "../../src/routes/community-endpoints/proxy-policy.ts";
import { test } from "../fixtures.ts";

const endpointUrl = "http://localhost:3000/api/account/my-models";

async function approveCommunityModels(): Promise<void> {
    await drizzle(env.DB)
        .update(schema.user)
        .set({ githubId: 36901823 })
        .where(eq(schema.user.githubUsername, "testuser"));
}

async function postModel(
    sessionToken: string,
    path: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const response = await SELF.fetch(`${endpointUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify(body),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json<Record<string, unknown>>();
}

describe("community endpoint configuration policy", () => {
    test("creates a private endpoint agent without proxy credentials or pricing", async ({
        sessionToken,
    }) => {
        const created = await postModel(sessionToken, "/endpoint-agents", {
            name: "external-agent",
            title: "External agent",
            description: "Runs on its owner's server",
            baseUrl: "https://agent.example.com/v1/?ignored=yes",
        });

        expect(created).toMatchObject({
            modelId: "testuser/external-agent",
            type: "endpoint_agent",
            name: "external-agent",
            title: "External agent",
            description: "Runs on its owner's server",
            visibility: "private",
            baseUrl: "https://agent.example.com/v1",
            upstreamModel: "external-agent",
            perUserRpm: null,
        });
        expect(created).not.toHaveProperty("bearerToken");
        expect(created).not.toHaveProperty("promptTextPrice");
        expect(created).not.toHaveProperty("fallbacks");

        const stored = await drizzle(env.DB, {
            schema,
        }).query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.id, created.id as string),
        });
        expect(stored).toMatchObject({
            type: "endpoint_agent",
            baseUrl: "https://agent.example.com/v1",
            upstreamModel: "external-agent",
            visibility: "private",
        });
        expect(
            parseListingPayload("endpoint_agent", stored?.payload ?? null),
        ).toEqual({ perUserRpm: null });
    });

    test("rejects proxy-only fields and unapproved public endpoint agents", async ({
        sessionToken,
    }) => {
        const request = (body: Record<string, unknown>) =>
            SELF.fetch(`${endpointUrl}/endpoint-agents`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify(body),
            });
        const input = {
            name: "external-agent",
            title: "External agent",
            baseUrl: "https://agent.example.com/v1",
        };

        const proxyField = await request({
            ...input,
            bearerToken: "must-not-be-stored",
        });
        expect(proxyField.status).toBe(400);

        const publicAgent = await request({
            ...input,
            visibility: "public",
        });
        expect(publicAgent.status).toBe(403);
    });

    test("preserves validation error precedence", () => {
        expect(() =>
            deriveCreateProxyPolicy({
                name: "invalid-policy",
                title: "Invalid policy",
                visibility: "public",
                baseUrl: "https://images.example.com/v1",
                bearerToken: "test-provider-token",
                modality: "image",
                imagePricing: "request",
                inputModalities: ["audio"],
                advertised: { contextLength: 32000 },
                paidOnly: false,
            }),
        ).toThrow("audio input is not supported for image models");
    });

    test("derives image pricing transitions and private visibility", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "image-policy",
            title: "Image policy",
            visibility: "public",
            baseUrl: "https://images.example.com/v1",
            bearerToken: "test-provider-token",
            modality: "image",
            imagePricing: "request",
            inputModalities: ["text", "image"],
            paidOnly: true,
            perUserRpm: 2.5,
            completionImagePrice: 0.2,
        });

        expect(created).toMatchObject({
            modality: "image",
            imagePricing: "request",
            inputModalities: ["text", "image"],
            paidOnly: true,
            perUserRpm: 2.5,
            completionImagePrice: 0.2,
        });

        const tokenPriced = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            {
                imagePricing: "tokens",
                promptImagePrice: 0.000001,
            },
        );
        expect(tokenPriced).toMatchObject({
            imagePricing: "tokens",
            promptTextPrice: 0,
            promptImagePrice: 0.000001,
            completionImagePrice: 0,
            paidOnly: true,
        });

        const privateModel = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { visibility: "private" },
        );
        expect(privateModel).toMatchObject({
            visibility: "private",
            inputModalities: ["text", "image"],
            perUserRpm: 2.5,
            paidOnly: false,
        });
        for (const { key } of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
            expect(privateModel[key]).toBe(0);
        }
    });

    test("keeps fallback writes and candidate discovery aligned", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const cheaper = await postModel(sessionToken, "", {
            name: "cheaper-fallback",
            title: "Cheaper fallback",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            promptTextPrice: 0.000001,
        });
        const expensive = await postModel(sessionToken, "", {
            name: "expensive-fallback",
            title: "Expensive fallback",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            promptTextPrice: 0.000003,
        });
        const cheaperModelId = cheaper.modelId as string;
        const expensiveModelId = expensive.modelId as string;
        const primary = await postModel(sessionToken, "", {
            name: "primary-with-fallback",
            title: "Primary with fallback",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            promptTextPrice: 0.000002,
            fallbacks: [cheaperModelId],
        });

        expect(primary.fallbacks).toEqual([cheaperModelId]);

        const response = await SELF.fetch(
            `${endpointUrl}/${primary.id as string}/fallback-candidates`,
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );
        expect(response.status, await response.clone().text()).toBe(200);
        const candidates = await response.json<{ data: string[] }>();
        expect(candidates.data).toContain(cheaperModelId);
        expect(candidates.data).not.toContain(expensiveModelId);
        expect(candidates.data).not.toContain(primary.modelId as string);
    });

    test("clears advertised metadata without rewriting payload for listing-only changes", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "text-policy",
            title: "Text policy",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            modality: "text",
            perUserRpm: 3,
            advertised: {
                capabilities: ["tool_calling"],
                contextLength: 32000,
            },
            promptTextPrice: 0.000001,
        });

        const cleared = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { advertised: {}, perUserRpm: null },
        );
        expect(cleared).toMatchObject({ advertised: {}, perUserRpm: null });

        const db = drizzle(env.DB, { schema });
        const before = await db.query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.id, created.id as string),
        });
        await postModel(sessionToken, `/${created.id as string}/update`, {
            title: "Renamed listing",
        });
        const after = await db.query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.id, created.id as string),
        });
        expect(after?.payload).toBe(before?.payload);
    });
});
