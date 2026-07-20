import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import * as schema from "@shared/db/better-auth.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

const stripeWebhookUrl = "http://localhost:3000/api/webhooks/stripe";

function signStripeWebhookPayload(payload: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

async function postSignedStripeWebhook(
    payloadObject: Record<string, unknown>,
): Promise<Response> {
    const payload = JSON.stringify(payloadObject);
    return SELF.fetch(stripeWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripeWebhookPayload(payload),
        },
        body: payload,
    });
}

function checkoutCompletedEvent({
    eventId,
    sessionId,
    userId,
    organizationId,
    packKey,
    amountUsd,
}: {
    eventId: string;
    sessionId: string;
    userId: string;
    organizationId?: string;
    packKey: string;
    amountUsd: number;
}) {
    return {
        id: eventId,
        type: "checkout.session.completed",
        livemode: false,
        data: {
            object: {
                id: sessionId,
                object: "checkout.session",
                metadata: {
                    userId,
                    packKey,
                    ...(organizationId ? { organizationId } : {}),
                },
                payment_status: "paid",
                amount_subtotal: amountUsd * 100,
                amount_total: amountUsd * 100,
                currency: "usd",
                customer_email: "buyer@example.com",
                payment_method_types: ["card"],
            },
        },
    };
}

describe("Organization funding via Stripe checkout", () => {
    test("checkout.session.completed with organizationId credits the org's pack balance, not the payer's", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const pack = getPollenPackByKey("p10");
        if (!pack) throw new Error("Expected p10 pack to exist");

        const createOrgResponse = await SELF.fetch(
            "http://localhost:3000/api/organizations",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({ name: "Funded Org" }),
            },
        );
        const org = await createOrgResponse.json();

        const db = drizzle(env.DB, { schema });
        const [payer] = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .limit(1);
        if (!payer) throw new Error("Expected seeded test user");

        const response = await postSignedStripeWebhook(
            checkoutCompletedEvent({
                eventId: "evt_org_fund_1",
                sessionId: "cs_org_fund_1",
                userId: payer.id,
                organizationId: org.id,
                packKey: pack.packKey,
                amountUsd: pack.amountUsd,
            }),
        );
        expect(response.status).toBe(200);

        const [updatedOrg] = await db
            .select({ packBalance: schema.organization.packBalance })
            .from(schema.organization)
            .where(eq(schema.organization.id, org.id));
        expect(updatedOrg?.packBalance).toBe(pack.amountUsd);

        const [updatedPayer] = await db
            .select({ packBalance: schema.user.packBalance })
            .from(schema.user)
            .where(eq(schema.user.id, payer.id));
        expect(updatedPayer?.packBalance ?? 0).toBe(0);

        const creditRow = await env.DB.prepare(
            `SELECT user_id AS userId, organization_id AS organizationId
            FROM stripe_checkout_credits
            WHERE session_id = 'cs_org_fund_1'`,
        ).first<{ userId: string; organizationId: string }>();
        expect(creditRow?.userId).toBe(payer.id);
        expect(creditRow?.organizationId).toBe(org.id);

        // Duplicate delivery (Stripe retry) must not double-credit.
        const duplicate = await postSignedStripeWebhook(
            checkoutCompletedEvent({
                eventId: "evt_org_fund_1_retry",
                sessionId: "cs_org_fund_1",
                userId: payer.id,
                organizationId: org.id,
                packKey: pack.packKey,
                amountUsd: pack.amountUsd,
            }),
        );
        expect(duplicate.status).toBe(200);

        const [orgAfterDuplicate] = await db
            .select({ packBalance: schema.organization.packBalance })
            .from(schema.organization)
            .where(eq(schema.organization.id, org.id));
        expect(orgAfterDuplicate?.packBalance).toBe(pack.amountUsd);
    });

    test("crediting a deleted organization falls back to the payer instead of stranding the payment", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const pack = getPollenPackByKey("p10");
        if (!pack) throw new Error("Expected p10 pack to exist");

        const createOrgResponse = await SELF.fetch(
            "http://localhost:3000/api/organizations",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({ name: "Deleted Before Webhook" }),
            },
        );
        const org = await createOrgResponse.json();

        await SELF.fetch(`http://localhost:3000/api/organizations/${org.id}`, {
            method: "DELETE",
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        });

        const db = drizzle(env.DB, { schema });
        const [payer] = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .limit(1);
        if (!payer) throw new Error("Expected seeded test user");

        const response = await postSignedStripeWebhook(
            checkoutCompletedEvent({
                eventId: "evt_org_fund_deleted",
                sessionId: "cs_org_fund_deleted",
                userId: payer.id,
                organizationId: org.id,
                packKey: pack.packKey,
                amountUsd: pack.amountUsd,
            }),
        );
        expect(response.status).toBe(200);

        const [updatedPayer] = await db
            .select({ packBalance: schema.user.packBalance })
            .from(schema.user)
            .where(eq(schema.user.id, payer.id));
        expect(updatedPayer?.packBalance).toBe(pack.amountUsd);
    });
});
