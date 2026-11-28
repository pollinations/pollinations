import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { WITHDRAWAL_STATEMENT } from "@shared/withdrawal.ts";
import { expect, test, vi } from "vitest";
import { withdrawalRoutes } from "@/routes/withdrawals.ts";
import {
    deliverWithdrawals,
    retryWithdrawals,
} from "@/services/withdrawals.ts";

const details = () => ({
    id: crypto.randomUUID(),
    name: "Ana García",
    email: "ana@example.com",
    purchase: "Two €20 credit top-ups on 16 November",
});
type Mail = { to: string; subject: string; text: string };
function outbox(send: (mail: Mail) => Promise<{ messageId: string }>) {
    return {
        ...env,
        ENVIRONMENT: "production",
        EMAIL: { send },
    } as unknown as CloudflareBindings;
}
async function submit(
    bindings: CloudflareBindings,
    data: ReturnType<typeof details>,
    ip = "192.0.2.17",
) {
    const ctx = createExecutionContext();
    const response = await withdrawalRoutes.request(
        "https://enter.pollinations.ai/",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Origin: "https://enter.pollinations.ai",
                "CF-Connecting-IP": ip,
            },
            body: JSON.stringify(data),
        },
        bindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

test("concurrent retries preserve one declaration and independently deliver its contents and time to both recipients", async () => {
    const send = vi.fn(async (_mail: Mail) => ({ messageId: "captured" }));
    const data = details();
    const replies = await Promise.all([
        submit(outbox(send), data),
        submit(outbox(send), data),
    ]);
    const receipt = await replies[0].json<{ id: string; receivedAt: string }>();
    expect(receipt.id).toBe(data.id);
    expect(await replies[1].json()).toEqual(receipt);
    expect(send.mock.calls.map(([mail]) => mail.to).sort()).toEqual([
        data.email,
        "billing@pollinations.ai",
    ]);
    for (const [mail] of send.mock.calls) {
        for (const field of [
            WITHDRAWAL_STATEMENT,
            data.name,
            data.email,
            data.purchase,
            receipt.id,
            receipt.receivedAt,
        ])
            expect(mail.text).toContain(field);
    }
    const conflict = await submit(outbox(send), {
        ...data,
        name: "Another person",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain(data.name);
    expect(send).toHaveBeenCalledTimes(2);
});

test("a failed buyer acknowledgement leaves billing delivered and can be retried without duplicating the declaration", async () => {
    const data = details();
    const bindings = outbox(async (m) => {
        if (m.to === data.email) throw new Error("temporary failure");
        return { messageId: "captured" };
    });
    const receipt = await (await submit(bindings, data)).json<{
        receivedAt: string;
    }>();
    const jobs = await env.DB.prepare(
        "SELECT recipient, attempts FROM withdrawal_delivery WHERE request_id=?",
    )
        .bind(data.id)
        .all();
    expect(jobs.results).toEqual([{ recipient: "buyer", attempts: 1 }]);
    const send = vi.fn(async (_mail: Mail) => ({ messageId: "accepted" }));
    await deliverWithdrawals(outbox(send));
    expect(send).not.toHaveBeenCalled();
    await env.DB.prepare(
        "UPDATE withdrawal_delivery SET next_attempt_at=0 WHERE request_id=?",
    )
        .bind(data.id)
        .run();
    await retryWithdrawals(outbox(send));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(data.email);
    expect(send.mock.calls[0][0].text).toContain(receipt.receivedAt);
});

test("persistent delivery failures reach the billing team for follow-up before intake details expire", async () => {
    const data = details();
    const bindings = outbox(async (m) => {
        if (m.to === data.email) throw new Error("undeliverable");
        return { messageId: "captured" };
    });
    await submit(bindings, data);
    await env.DB.prepare(
        "UPDATE withdrawal_request SET received_at = ? WHERE id = ?",
    )
        .bind(Date.now() - 31 * 86_400_000, data.id)
        .run();
    await env.DB.prepare(
        "UPDATE withdrawal_delivery SET attempts = 3, next_attempt_at = 0 WHERE request_id = ?",
    )
        .bind(data.id)
        .run();
    await retryWithdrawals(bindings);
    expect(
        await env.DB.prepare(
            "SELECT recipient FROM withdrawal_delivery WHERE request_id = ?",
        )
            .bind(data.id)
            .first("recipient"),
    ).toBe("billing_followup");
    expect(
        await env.DB.prepare(
            "SELECT ip_key FROM withdrawal_request WHERE id = ?",
        )
            .bind(data.id)
            .first("ip_key"),
    ).toBeNull();
    const send = vi.fn(async (_mail: Mail) => ({ messageId: "accepted" }));
    await retryWithdrawals(outbox(send));
    expect(send.mock.calls[0][0]).toMatchObject({
        to: "billing@pollinations.ai",
        subject: "Action needed: undelivered withdrawal receipt",
    });
    expect(send.mock.calls[0][0].text).toContain(data.email);
    expect(
        await env.DB.prepare("SELECT id FROM withdrawal_request WHERE id = ?")
            .bind(data.id)
            .first(),
    ).toBeNull();
});

test("the public API rejects invalid fields, cross-site requests and large bodies", async () => {
    const request = (body: string, origin = "http://localhost:3000") =>
        SELF.fetch("http://localhost:3000/api/withdrawals", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: origin },
            body,
        });
    expect(
        (
            await request(
                JSON.stringify({
                    ...details(),
                    email: "x@example.com,second@example.com",
                }),
            )
        ).status,
    ).toBe(400);
    expect(
        (
            await request(
                JSON.stringify({
                    ...details(),
                    purchase: "purchase\nInjected line",
                }),
            )
        ).status,
    ).toBe(400);
    expect((await request("{")).status).toBe(400);
    expect(
        (await request(JSON.stringify(details()), "https://unrelated.example"))
            .status,
    ).toBe(403);
    expect((await request("a".repeat(8200))).status).toBe(413);
    expect(
        await env.DB.prepare(
            "SELECT count(*) AS n FROM withdrawal_request",
        ).first("n"),
    ).toBe(0);
});

test("consumer address and source IP each limit new declarations; a matching retry succeeds above quota", async () => {
    const data = details();
    // This transport would fail the test if a nonproduction environment sent external mail.
    const send = vi.fn(async (_m: Mail) => ({ messageId: "unexpected" }));
    const local = {
        ...outbox(send),
        ENVIRONMENT: "local",
    } as CloudflareBindings;
    expect((await submit(local, data)).status).toBe(200);
    for (let i = 1; i < 6; i++)
        expect(
            (await submit(local, { ...data, id: crypto.randomUUID() })).status,
        ).toBe(200);
    expect(
        (
            await submit(
                local,
                {
                    ...data,
                    id: crypto.randomUUID(),
                    email: data.email.toUpperCase(),
                },
                "192.0.2.18",
            )
        ).status,
    ).toBe(429);
    expect((await submit(local, data)).status).toBe(200);
    for (let i = 6; i < 20; i++)
        expect(
            (
                await submit(local, {
                    ...data,
                    id: crypto.randomUUID(),
                    email: `buyer${i}@example.com`,
                })
            ).status,
        ).toBe(200);
    expect(
        (
            await submit(local, {
                ...data,
                id: crypto.randomUUID(),
                email: "extra@example.com",
            })
        ).status,
    ).toBe(429);
    expect(send).not.toHaveBeenCalled();
});
