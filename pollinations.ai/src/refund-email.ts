export const withdrawalStatement =
    "I withdraw from the contract for the credit top-up identified below.";
const billing = "billing@pollinations.ai";

export interface RefundMailBindings {
    REFUND_EMAIL?: {
        send(message: {
            from: string;
            to: string;
            cc: string[];
            replyTo: string;
            subject: string;
            text: string;
        }): Promise<unknown>;
    };
    REFUND_LIMIT?: {
        limit(input: { key: string }): Promise<{ success: boolean }>;
    };
}

export async function sendRefundRequest(
    request: Request,
    env: RefundMailBindings,
): Promise<Response> {
    if (request.headers.get("Origin") !== new URL(request.url).origin)
        return new Response(null, { status: 403 });
    if (
        request.headers.get("Content-Type")?.split(";")[0] !==
        "application/x-www-form-urlencoded"
    )
        return new Response(null, { status: 415 });
    // Cloudflare can forward a request without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const bytes = new Uint8Array(8192);
    let size = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (size + value.length > bytes.length) {
            await reader.cancel();
            return new Response(null, { status: 413 });
        }
        bytes.set(value, size);
        size += value.length;
    }
    const data = new URLSearchParams(
        new TextDecoder().decode(bytes.subarray(0, size)),
    );
    const name = data.get("name")?.trim() ?? "";
    const purchase = data.get("purchase")?.trim() ?? "";
    const email = data.get("email")?.trim() ?? "";
    const singleLine = /^[^\p{Cc}\p{Zl}\p{Zp}]+$/u;
    if (
        !singleLine.test(name) ||
        name.length > 120 ||
        !singleLine.test(purchase) ||
        purchase.length > 300 ||
        email.length > 254 ||
        !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(
            email,
        )
    )
        return new Response(null, { status: 400 });

    if (!env.REFUND_EMAIL || !env.REFUND_LIMIT)
        return new Response(null, { status: 503 });
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    for (const key of [`ip:${ip}`, `email:${email.toLowerCase()}`]) {
        if (!(await env.REFUND_LIMIT.limit({ key })).success)
            return new Response(null, {
                status: 429,
                headers: { "Retry-After": "60" },
            });
    }
    const received = new Date().toISOString();
    try {
        await env.REFUND_EMAIL.send({
            from: "notifications@notify.pollinations.ai",
            to: billing,
            cc: [email],
            replyTo: billing,
            subject: "Credit top-up withdrawal received",
            text: [
                "Pollinations billing received this withdrawal request and will review the purchase.",
                "",
                withdrawalStatement,
                `Name: ${name}`,
                `Credit top-up: ${purchase}`,
                `Confirmation email: ${email}`,
                `Received (UTC): ${received}`,
            ].join("\n"),
        });
    } catch {
        return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 204 });
}
