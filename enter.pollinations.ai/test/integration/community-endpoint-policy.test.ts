import { env, SELF } from "cloudflare:test";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
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
