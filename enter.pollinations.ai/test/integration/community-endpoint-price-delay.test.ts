import { env, SELF } from "cloudflare:test";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    PRICE_CHANGE_DELAY_MS,
} from "@shared/community-endpoints.ts";
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

async function advancePendingPast12Hours(id: string): Promise<void> {
    await drizzle(env.DB)
        .update(schema.communityEndpoint)
        .set({ pendingAt: new Date(Date.now() - PRICE_CHANGE_DELAY_MS - 1000) })
        .where(eq(schema.communityEndpoint.id, id));
}

describe("community endpoint 12-hour price-change delay", () => {
    test("first model creation is always immediate regardless of price or visibility", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "first-price-model",
            title: "First price model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000002,
        });

        expect(created).toMatchObject({
            visibility: "public",
            promptTextPrice: 0.000002,
            pending: null,
        });
    });

    test("price change on a public model is queued for 12 hours", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "queued-price-model",
            title: "Queued price model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000001,
        });

        const updated = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { promptTextPrice: 0.000003 },
        );

        // Current price is unchanged; pending shows the new price.
        expect(updated).toMatchObject({ promptTextPrice: 0.000001 });
        expect(updated.pending).toMatchObject({ promptTextPrice: 0.000003 });
        expect(
            typeof (updated.pending as Record<string, unknown>).effectiveAt,
        ).toBe("string");
        expect(
            (updated.pending as Record<string, unknown>).visibility,
        ).toBeUndefined();
    });

    test("pending price becomes effective after the deadline", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "effective-price-model",
            title: "Effective price model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000001,
        });

        await postModel(sessionToken, `/${created.id as string}/update`, {
            promptTextPrice: 0.000003,
        });

        await advancePendingPast12Hours(created.id as string);

        // Read the model list; the effective price should now reflect the pending change.
        const listResponse = await SELF.fetch(`${endpointUrl}/`, {
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        });
        const list = await listResponse.json<{
            data: Record<string, unknown>[];
        }>();
        const row = list.data.find((m) => m.id === created.id);

        expect(row).toMatchObject({
            promptTextPrice: 0.000003,
            pending: null,
        });
    });

    test("paidOnly change on a public model is queued", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "paid-only-model",
            title: "PaidOnly model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            paidOnly: false,
        });

        const updated = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { paidOnly: true },
        );

        expect(updated).toMatchObject({ paidOnly: false });
        expect((updated.pending as Record<string, unknown>).paidOnly).toBe(
            true,
        );
    });

    test("private-to-public transition is queued for 12 hours", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "visibility-pending-model",
            title: "Visibility pending model",
            visibility: "private",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
        });

        const published = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { visibility: "public", promptTextPrice: 0.000001 },
        );

        // Still private; pending will make it public.
        expect(published).toMatchObject({ visibility: "private" });
        expect(published.pending).toMatchObject({
            visibility: "public",
            promptTextPrice: 0.000001,
        });
    });

    test("visibility becomes public after the deadline", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "visibility-fires-model",
            title: "Visibility fires model",
            visibility: "private",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
        });

        await postModel(sessionToken, `/${created.id as string}/update`, {
            visibility: "public",
        });

        await advancePendingPast12Hours(created.id as string);

        const listResponse = await SELF.fetch(`${endpointUrl}/`, {
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        });
        const list = await listResponse.json<{
            data: Record<string, unknown>[];
        }>();
        const row = list.data.find((m) => m.id === created.id);

        expect(row).toMatchObject({
            visibility: "public",
            pending: null,
        });
    });

    test("public-to-private is immediate and clears any pending price change", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "private-immediate-model",
            title: "Private immediate model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000002,
        });

        // Queue a price change.
        await postModel(sessionToken, `/${created.id as string}/update`, {
            promptTextPrice: 0.000005,
        });

        // Go private — immediate, clears pending.
        const privateModel = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { visibility: "private" },
        );

        expect(privateModel).toMatchObject({
            visibility: "private",
            pending: null,
        });
        for (const { key } of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
            expect(privateModel[key]).toBe(0);
        }

        const db = drizzle(env.DB, { schema });
        const row = await db.query.communityEndpoint.findFirst({
            where: eq(schema.communityEndpoint.id, created.id as string),
        });
        expect(row?.pendingPayload).toBeNull();
        expect(row?.pendingAt).toBeNull();
    });

    test("price change while private with pending visibility: pending preserved with new price", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "dual-pending-model",
            title: "Dual pending model",
            visibility: "private",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
        });

        // Request to go public — queues visibility change.
        await postModel(sessionToken, `/${created.id as string}/update`, {
            visibility: "public",
        });

        // Price change while still private — immediate but folds into pending.
        const priceUpdated = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { promptTextPrice: 0.000005 },
        );

        // Private model displays 0 prices.
        expect(priceUpdated).toMatchObject({
            promptTextPrice: 0,
            visibility: "private",
        });
        // Pending visibility is preserved; new price is staged for when it fires.
        expect(
            (priceUpdated.pending as Record<string, unknown>).visibility,
        ).toBe("public");
        expect(
            (priceUpdated.pending as Record<string, unknown>).promptTextPrice,
        ).toBe(0.000005);
    });

    test("non-pricing updates on public models are immediate", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "non-price-update-model",
            title: "Non price update model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
        });

        const updated = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { title: "Renamed model", perUserRpm: 5 },
        );

        expect(updated).toMatchObject({
            title: "Renamed model",
            perUserRpm: 5,
            pending: null,
        });
    });
});
