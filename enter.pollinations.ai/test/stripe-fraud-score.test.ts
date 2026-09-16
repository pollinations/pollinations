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
    FRAUD_SCAN_START_SECONDS,
    hasConfirmedFraud,
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
        charges: 106,
        unmapped: 0,
        report: [{ id: user.id, name: expect.any(String), score: 0.75 }],
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
    ).toMatchObject({ candidates: 0, applied: 0, report: [] });
    expect(mocks.stripe.state.checkoutSessions[0].status).toBe("open");
    expect(
        await runFraudBanCheck(stripe, queryD1, { apply: true }),
    ).toMatchObject({ candidates: 1, applied: 1, report: [{ id: user.id }] });
    // Already-banned accounts stay candidates but no longer need review.
    expect(await runFraudBanCheck(stripe, queryD1)).toMatchObject({
        candidates: 1,
        report: [],
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

test("manual review includes a first warning below threshold and prioritizes higher scores", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    await env.DB.prepare(
        "INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('higher_score', 'Review account', 'review@example.test', ?, ?)",
    )
        .bind(Date.now(), Date.now())
        .run();
    mocks.stripe.state.fraudCharges.push(
        {
            id: "ch_first_warning",
            livemode: true,
            metadata: { userId: user.id },
        },
        ...Array.from({ length: 6 }, (_, i) => ({
            id: `ch_review_${i}`,
            livemode: true,
            metadata: { userId: "higher_score" },
        })),
    );
    mocks.stripe.state.fraudWarnings.push({
        id: "issfr_first",
        livemode: true,
        charge: "ch_first_warning",
    });
    mocks.stripe.state.fraudDisputes.push(
        ...Array.from({ length: 6 }, (_, i) => ({
            id: `dp_review_${i}`,
            livemode: true,
            reason: "fraudulent",
            charge: `ch_review_${i}`,
        })),
    );
    const result = await runFraudBanCheck(client(), queryD1);
    expect(result).toMatchObject({ candidates: 1, applied: 0 });
    expect(result.report.map(({ id, score }) => ({ id, score }))).toEqual([
        { id: "higher_score", score: 0.75 },
        { id: user.id, score: 0.15 },
    ]);
    expect(
        await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM user WHERE banned = 1",
        ).first(),
    ).toEqual({ n: 0 });
    await env.DB.prepare(
        "UPDATE user SET banned = 1 WHERE id = 'higher_score'",
    ).run();
    expect(
        (
            await runFraudBanCheck(client(), queryD1, {
                excludedUserIds: [user.id],
            })
        ).report,
    ).toEqual([]);
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

test("radar predictions alone never ban, however many there are", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    // One legitimate card retried after a decline: Radar escalates every
    // attempt, which is exactly how a paying customer used to score a ban.
    mocks.stripe.state.fraudCharges.push(
        ...Array.from({ length: 600 }, (_, i) => ({
            id: `ch_retry_${i}`,
            object: "charge",
            livemode: true,
            customer: "cus_retry",
            metadata: { userId: user.id },
            outcome: { type: "blocked", risk_level: "highest" },
        })),
    );
    const stripe = client();
    expect(
        await runFraudBanCheck(stripe, queryD1, { apply: true }),
    ).toMatchObject({ candidates: 0, applied: 0 });
    expect(
        (
            await env.DB.prepare("SELECT banned FROM user WHERE id = ?")
                .bind(user.id)
                .first()
        )?.banned,
    ).not.toBe(1);
    // A single confirmed signal on top of the same history does ban.
    mocks.stripe.state.fraudWarnings.push({
        id: "issfr_confirmed",
        livemode: true,
        charge: "ch_retry_0",
    });
    expect(
        await runFraudBanCheck(stripe, queryD1, { apply: true }),
    ).toMatchObject({ candidates: 1, applied: 1 });
});

test("confirmed signals are disputes, warnings and fraud reports only", () => {
    expect(hasConfirmedFraud([{ chargeId: "ch_a", hr: true, rb: true }])).toBe(
        false,
    );
    expect(hasConfirmedFraud([{ chargeId: "ch_a", fd: true }])).toBe(true);
    expect(hasConfirmedFraud([{ chargeId: "ch_a", ew: true }])).toBe(true);
    expect(hasConfirmedFraud([{ chargeId: "ch_a", fraud: true }])).toBe(true);
    expect(hasConfirmedFraud([])).toBe(false);
});

test("charges before the attribution window are skipped, not treated as a gap", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    mocks.stripe.state.fraudCharges.push({
        id: "ch_inside",
        object: "charge",
        livemode: true,
        customer: "cus_window",
        metadata: { userId: user.id },
        created: FRAUD_SCAN_START_SECONDS + 1,
    });
    // Raised recently, but against a charge from the unattributable era. The
    // scan never lists that charge, so it must be skipped rather than failing.
    mocks.stripe.state.fraudDisputes.push({
        id: "dp_old",
        object: "dispute",
        livemode: true,
        reason: "fraudulent",
        charge: "ch_before_window",
    });
    mocks.stripe.state.archivedCharges.push({
        id: "ch_before_window",
        object: "charge",
        livemode: true,
        created: FRAUD_SCAN_START_SECONDS - 1,
    });
    const result = await collectStripeFraudScores(client(), [
        { id: user.id, stripe_customer_id: "cus_window" },
    ]);
    expect(result.charges).toBe(1);
    expect(result.confirmed.has(user.id)).toBe(false);
});
