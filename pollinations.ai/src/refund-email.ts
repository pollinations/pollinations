export interface RefundMailBindings {
    REFUND_BILLING?: {
        submitWithdrawal(
            accountId: string,
            invoiceNumber: string,
        ): Promise<boolean>;
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
    const accountId = data.get("accountId")?.trim() ?? "";
    const invoiceNumber = data.get("invoiceNumber")?.trim() ?? "";
    if (
        [accountId, invoiceNumber].some(
            (value) => !/^[^\s\p{Cc}]{1,128}$/u.test(value),
        )
    )
        return new Response(null, { status: 400 });

    if (!env.REFUND_BILLING || !env.REFUND_LIMIT)
        return new Response(null, { status: 503 });
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    for (const key of [`ip:${ip}`, `account:${accountId}`]) {
        if (!(await env.REFUND_LIMIT.limit({ key })).success)
            return new Response(null, {
                status: 429,
                headers: { "Retry-After": "60" },
            });
    }
    try {
        const matched = await env.REFUND_BILLING.submitWithdrawal(
            accountId,
            invoiceNumber,
        );
        return new Response(null, { status: matched ? 204 : 422 });
    } catch {
        return new Response(null, { status: 503 });
    }
}
