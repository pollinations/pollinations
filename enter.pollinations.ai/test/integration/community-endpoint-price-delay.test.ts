import { env, SELF } from "cloudflare:test";
import {
    COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { getVisibleModelIdsForUser } from "@shared/registry/visible-model-ids.ts";
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

async function advancePendingPastDelay(id: string): Promise<void> {
    await drizzle(env.DB)
        .update(schema.communityEndpoint)
        .set({
            pendingAt: new Date(
                Date.now() - COMMUNITY_ENDPOINT_CHANGE_DELAY_MS - 1000,
            ),
        })
        .where(eq(schema.communityEndpoint.id, id));
}

async function publishPendingModel(
    sessionToken: string,
    id: string,
): Promise<Record<string, unknown>> {
    await advancePendingPastDelay(id);
    return postModel(sessionToken, `/${id}/update`, {});
}

describe("community endpoint 3-hour price-change delay", () => {
    test("uses a 3-hour delay", () => {
        expect(COMMUNITY_ENDPOINT_CHANGE_DELAY_MS).toBe(3 * 60 * 60 * 1000);
    });

    test("first public model creation is queued for 3 hours", async ({
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
            visibility: "private",
            promptTextPrice: 0,
            pending: {
                visibility: "public",
                promptTextPrice: 0.000002,
            },
        });

        await advancePendingPastDelay(created.id as string);
        const visibleModels = await getVisibleModelIdsForUser(
            env.DB,
            "another-user",
        );
        expect(visibleModels).toContain(created.modelId);

        const published = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            {},
        );
        expect(published).toMatchObject({
            visibility: "public",
            promptTextPrice: 0.000002,
            pending: null,
        });
    });

    test("deleting and recreating a public model starts a new delay", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const input = {
            name: "recreated-model",
            title: "Recreated model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000002,
        };
        const created = await postModel(sessionToken, "", input);
        await publishPendingModel(sessionToken, created.id as string);

        const deleted = await SELF.fetch(
            `${endpointUrl}/${created.id as string}`,
            {
                method: "DELETE",
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );
        expect(deleted.status, await deleted.clone().text()).toBe(200);

        const recreated = await postModel(sessionToken, "", input);
        expect(recreated).toMatchObject({
            visibility: "private",
            promptTextPrice: 0,
            pending: {
                visibility: "public",
                promptTextPrice: 0.000002,
            },
        });
    });

    test("price change on a public model is queued for 3 hours", async ({
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
        await publishPendingModel(sessionToken, created.id as string);

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
        await publishPendingModel(sessionToken, created.id as string);

        await postModel(sessionToken, `/${created.id as string}/update`, {
            promptTextPrice: 0.000003,
        });

        await advancePendingPastDelay(created.id as string);

        // Read the model list; the effective price should now reflect the pending change.
        const listResponse = await SELF.fetch(endpointUrl, {
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
        await publishPendingModel(sessionToken, created.id as string);

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

    test("private-to-public transition is queued for 3 hours", async ({
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

        await advancePendingPastDelay(created.id as string);

        const listResponse = await SELF.fetch(endpointUrl, {
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
        await publishPendingModel(sessionToken, created.id as string);

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

    test("unhiding waits for the publication delay", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "relisted-model",
            title: "Relisted model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
        });
        const id = created.id as string;
        await publishPendingModel(sessionToken, id);
        const db = drizzle(env.DB);
        await db
            .update(schema.communityEndpoint)
            .set({
                hiddenAt: new Date(),
                hiddenReason: "Hidden by monitor",
                hiddenBy: "monitor",
            })
            .where(eq(schema.communityEndpoint.id, id));

        const early = await SELF.fetch(`${endpointUrl}/${id}/update`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({ hidden: false }),
        });
        expect(early.status).toBe(400);
        expect(await early.text()).toContain(
            "can be relisted 3 hours after they were hidden",
        );

        await db
            .update(schema.communityEndpoint)
            .set({
                hiddenAt: new Date(
                    Date.now() - COMMUNITY_ENDPOINT_CHANGE_DELAY_MS - 1000,
                ),
            })
            .where(eq(schema.communityEndpoint.id, id));
        const relisted = await postModel(sessionToken, `/${id}/update`, {
            hidden: false,
        });
        expect(relisted).toMatchObject({ hidden: false, hiddenAt: null });
    });

    test("price change during pending publication restarts the delay", async ({
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
        const previousPendingAt = new Date(Date.now() - 60 * 60 * 1000);
        await drizzle(env.DB)
            .update(schema.communityEndpoint)
            .set({ pendingAt: previousPendingAt })
            .where(eq(schema.communityEndpoint.id, created.id as string));

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
        expect(
            Date.parse(
                (priceUpdated.pending as Record<string, string>).effectiveAt,
            ),
        ).toBeGreaterThan(
            previousPendingAt.getTime() + COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
        );
    });

    test("non-pricing updates are immediate without clearing a pending price", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "", {
            name: "non-price-update-model",
            title: "Non price update model",
            visibility: "public",
            baseUrl: "https://text.example.com/v1",
            bearerToken: "tok",
            promptTextPrice: 0.000001,
        });
        await publishPendingModel(sessionToken, created.id as string);

        const queued = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { promptTextPrice: 0.000003 },
        );
        const effectiveAt = (queued.pending as Record<string, unknown>)
            .effectiveAt;

        const updated = await postModel(
            sessionToken,
            `/${created.id as string}/update`,
            { title: "Renamed model", perUserRpm: 5 },
        );

        expect(updated).toMatchObject({
            title: "Renamed model",
            perUserRpm: 5,
            promptTextPrice: 0.000001,
        });
        expect(updated.pending).toMatchObject({
            effectiveAt,
            promptTextPrice: 0.000003,
        });
    });

    test("public endpoint-agent creation uses the same delay", async ({
        sessionToken,
    }) => {
        await approveCommunityModels();
        const created = await postModel(sessionToken, "/endpoint-agents", {
            name: "pending-endpoint-agent",
            title: "Pending endpoint agent",
            baseUrl: "https://agent.example.com/v1",
            visibility: "public",
        });

        expect(created).toMatchObject({
            type: "endpoint_agent",
            visibility: "private",
            pending: { visibility: "public" },
        });
    });
});
