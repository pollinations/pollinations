import { env, SELF } from "cloudflare:test";
import { PRICE_CHANGE_DELAY_MS } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
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

async function listModels(
    sessionToken: string,
): Promise<Array<Record<string, unknown>>> {
    const response = await SELF.fetch(endpointUrl, {
        headers: {
            Cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const body = await response.json<{
        data: Array<Record<string, unknown>>;
    }>();
    return body.data;
}

describe("community endpoint price/visibility delay", () => {
    test("keeps a public price change pending until the deadline passes", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        await postModel(sessionToken, "", {
            name: "delay-model",
            title: "Delay model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            promptTextPrice: 0.000001,
        });

        const pending = await postModel(sessionToken, "/delay-model/update", {
            promptTextPrice: 0.000004,
        });
        expect(pending.pending).toMatchObject({
            effectiveAt: expect.any(String),
            promptTextPrice: 0.000004,
        });
        expect(pending.promptTextPrice).toBe(0.000001);

        let row = await drizzle(env.DB, {
            schema,
        }).query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.name, "delay-model"),
        });
        expect(row?.payload).toContain("0.000001");
        expect(row?.pendingPayload).toContain("0.000004");

        await drizzle(env.DB, { schema })
            .update(schema.communityEndpoint)
            .set({
                pendingAt: new Date(Date.now() - PRICE_CHANGE_DELAY_MS - 1),
            })
            .where(eq(schema.communityEndpoint.name, "delay-model"));

        const after = await listModels(sessionToken);
        const effective = after.find((m) => m.name === "delay-model");
        expect(effective?.promptTextPrice).toBe(0.000004);
        expect(effective?.pending).toBeNull();
    });

    test("applies a public->private change immediately and clears pending", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        await postModel(sessionToken, "", {
            name: "revert-model",
            title: "Revert model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "test-provider-token",
            promptTextPrice: 0.000001,
        });

        const pending = await postModel(sessionToken, "/revert-model/update", {
            promptTextPrice: 0.000004,
        });
        expect(pending.pending?.promptTextPrice).toBe(0.000004);

        const reverted = await postModel(sessionToken, "/revert-model/update", {
            visibility: "private",
        });
        expect(reverted.pending).toBeNull();
        expect(reverted.visibility).toBe("private");

        const finalRow = await drizzle(env.DB, {
            schema,
        }).query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.name, "revert-model"),
        });
        expect(finalRow?.pendingAt).toBeNull();
        expect(finalRow?.pendingPayload).toBeNull();
    });
});
