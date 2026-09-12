import { env } from "cloudflare:test";
import Stripe from "stripe";
import { expect } from "vitest";
import {
    fraudBanQueries,
    runFraudBanCheck,
} from "../src/utils/stripe-fraud-ban.ts";
import {
    cappedFraudScore,
    collectStripeFraudScores,
    FRAUD_BAN_EXCLUDED_USER_ID,
} from "../src/utils/stripe-fraud-score.ts";
import { test } from "./fixtures.ts";

const payments = (count: number, flags: Record<string, boolean>) =>
    Array.from({ length: count }, (_, i) => ({
        chargeId: `ch_${i}`,
        ...flags,
    }));

test("capped score matches the simulator weights, curve, and rounding", () => {
    expect(cappedFraudScore([])).toBe(0);
    expect(cappedFraudScore(payments(2, { fd: true }))).toBe(0.5);
    expect(cappedFraudScore(payments(6, { fd: true }))).toBe(0.75);
    expect(cappedFraudScore(payments(9, { fd: true }))).toBe(0.87);
    expect(cappedFraudScore(payments(1000, { fd: true }))).toBe(5);
    expect(cappedFraudScore(payments(2000, { hr: true }))).toBe(1);
    expect(cappedFraudScore(payments(1000, { rb: true }))).toBe(0);
    expect(cappedFraudScore([{ chargeId: "py_noncard", fd: true }])).toBe(0.39);
    expect(() => cappedFraudScore([{ chargeId: "", fd: true }])).toThrow();
});

test("overlapping signals and duplicate events count once per payment", () => {
    const overlapping = [
        ...payments(2, { ew: true, hr: true }),
        ...payments(2, { fraud: true }),
        ...payments(2, { fd: true }),
    ];
    expect(cappedFraudScore(overlapping)).toBe(0.5);
    expect(
        cappedFraudScore([
            ...payments(2, { fraud: true }),
            { chargeId: "py_other", ew: true },
        ]),
    ).toBe(0.45);
    expect(fraudBanQueries(FRAUD_BAN_EXCLUDED_USER_ID)).toEqual([]);
});

type Query = { sql: string; params?: string[] };
async function queryD1(body: Query | { batch: Query[] }) {
    const queries = "batch" in body ? body.batch : [body];
    return env.DB.batch(
        queries.map(({ sql, params }) =>
            env.DB.prepare(sql).bind(...(params ?? [])),
        ),
    );
}
const client = () => new Stripe("sk_test_mock", { maxNetworkRetries: 0 });

test("hourly scan reads every page; dry run is read-only; apply bans and expires checkouts", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    mocks.stripe.state.fraudCharges.push(
        ...Array.from({ length: 106 }, (_, i) => ({
            id: `ch_${i}`,
            object: "charge",
            livemode: true,
            customer: "cus_fraud",
            metadata: { userId: user.id },
        })),
    );
    mocks.stripe.state.fraudDisputes.push(
        ...Array.from({ length: 106 }, (_, i) => ({
            id: `dp_${i}`,
            object: "dispute",
            livemode: true,
            reason: "fraudulent",
            charge: `ch_${i % 6}`,
        })),
    );
    mocks.stripe.state.fraudWarnings.push(
        ...Array.from({ length: 101 }, (_, i) => ({
            id: `issfr_${i}`,
            livemode: true,
            charge: "ch_0",
        })),
    );
    mocks.stripe.state.checkoutSessions.push({
        id: "cs_open",
        object: "checkout.session",
        mode: "payment",
        customer: "cus_fraud",
        status: "open",
        url: null,
    });
    const stripe = client();
    expect(await runFraudBanCheck(stripe, queryD1)).toEqual({
        candidates: 1,
        applied: 0,
    });
    expect(
        mocks.stripe.state.requests.filter(
            (request) => request.path === "/v1/charges",
        ),
    ).toHaveLength(2);
    for (const path of ["/v1/disputes", "/v1/radar/early_fraud_warnings"]) {
        expect(
            mocks.stripe.state.requests.filter(
                (request) => request.path === path,
            ),
        ).toHaveLength(2);
    }
    expect(
        (
            await env.DB.prepare("SELECT banned FROM user WHERE id = ?")
                .bind(user.id)
                .first()
        )?.banned,
    ).not.toBe(1);
    expect(
        await runFraudBanCheck(stripe, queryD1, {
            apply: true,
            excludedUserIds: [user.id],
        }),
    ).toEqual({ candidates: 0, applied: 0 });
    expect(mocks.stripe.state.checkoutSessions[0].status).toBe("open");
    expect(await runFraudBanCheck(stripe, queryD1, { apply: true })).toEqual({
        candidates: 1,
        applied: 1,
    });
    expect(
        await env.DB.prepare(
            "SELECT banned, auto_top_up_enabled FROM user WHERE id = ?",
        )
            .bind(user.id)
            .first(),
    ).toMatchObject({ banned: 1, auto_top_up_enabled: 0 });
    expect(
        (
            await env.DB.prepare(
                "SELECT COUNT(*) AS n FROM session WHERE user_id = ?",
            )
                .bind(user.id)
                .first()
        )?.n,
    ).toBe(0);
    expect(mocks.stripe.state.checkoutSessions[0].status).toBe("expired");
});

test("incomplete Stripe scans cannot apply any bans", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    mocks.stripe.state.fraudCharges.push(
        ...Array.from({ length: 6 }, (_, i) => ({
            id: `ch_${i}`,
            livemode: true,
            metadata: { userId: user.id },
        })),
    );
    mocks.stripe.state.fraudDisputes.push(
        ...Array.from({ length: 6 }, (_, i) => ({
            id: `dp_${i}`,
            livemode: true,
            reason: "fraudulent",
            charge: `ch_${i}`,
        })),
    );
    mocks.stripe.state.failFraudWarnings = true;
    await expect(
        runFraudBanCheck(client(), queryD1, { apply: true }),
    ).rejects.toThrow();
    expect(
        (
            await env.DB.prepare(
                "SELECT COUNT(*) AS n FROM user WHERE banned = 1",
            ).first()
        )?.n,
    ).toBe(0);
    mocks.stripe.state.failFraudWarnings = false;
    mocks.stripe.state.fraudWarnings.push({
        id: "issfr_missing",
        livemode: true,
        charge: "ch_missing",
    });
    await expect(
        runFraudBanCheck(client(), queryD1, { apply: true }),
    ).rejects.toThrow("Incomplete Stripe charge coverage");
});

test("identity conflicts and email-only charges are not attributed", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    mocks.stripe.state.fraudCharges.push(
        {
            id: "ch_conflict",
            livemode: true,
            customer: "cus_a",
            metadata: { userId: "b" },
            outcome: { risk_level: "highest" },
        },
        {
            id: "ch_email",
            livemode: true,
            billing_details: { email: "a@example.com" },
            outcome: { risk_level: "highest" },
        },
        {
            id: "py_valid",
            livemode: true,
            customer: "cus_a",
            outcome: { risk_level: "highest" },
        },
    );
    const result = await collectStripeFraudScores(client(), [
        { id: "a", stripe_customer_id: "cus_a" },
        { id: "b", stripe_customer_id: null },
    ]);
    expect(result.unmapped).toBe(2);
    expect(result.conflicting).toBe(1);
    expect(result.scores.get("a")).toBe(0.08);
    expect(result.scores.has("b")).toBe(false);
});

test("shared customer checkouts are not expired for another account", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    mocks.stripe.state.fraudCharges.push(
        ...["a", "b"].map((id) => ({
            id: `ch_${id}`,
            livemode: true,
            customer: "cus_shared",
            metadata: { userId: id },
            outcome: { risk_level: "highest" },
        })),
    );
    const result = await collectStripeFraudScores(
        client(),
        ["a", "b"].map((id) => ({ id, stripe_customer_id: null })),
    );
    expect(result.scores.size).toBe(2);
    expect(result.customers.get("a")?.size).toBe(0);
    expect(result.customers.get("b")?.size).toBe(0);
});
