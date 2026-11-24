const MAX_BODY_BYTES = 64 * 1024;
const SIGNATURE_WINDOW_MS = 5 * 60_000;

export type DiscordJob = {
    id: string;
    applicationId: string;
    token: string;
    body: string;
    expiresAt: number;
};

const hexBytes = (hex: string) =>
    Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
        Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    );

async function readBody(request: Request) {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const bytes = new Uint8Array(MAX_BODY_BYTES);
    let length = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return bytes.subarray(0, length);
            if (length + value.byteLength > bytes.length) {
                await reader.cancel();
                return null;
            }
            bytes.set(value, length);
            length += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
}

export async function receiveDiscordInteraction(
    request: Request,
    publicKey: string,
    enqueue: (job: DiscordJob) => Promise<void>,
) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const timestamp = request.headers.get("x-signature-timestamp") ?? "";
    const signature = request.headers.get("x-signature-ed25519") ?? "";
    if (
        !/^\d{10}$/.test(timestamp) ||
        Math.abs(Date.now() - Number(timestamp) * 1000) > SIGNATURE_WINDOW_MS ||
        !/^[a-f0-9]{128}$/i.test(signature)
    ) {
        return new Response(null, { status: 401 });
    }
    const bytes = await readBody(request);
    if (!bytes) return new Response(null, { status: 413 });
    const prefix = new TextEncoder().encode(timestamp);
    const signed = new Uint8Array(prefix.length + bytes.length);
    signed.set(prefix);
    signed.set(bytes, prefix.length);
    const key = await crypto.subtle.importKey(
        "raw",
        hexBytes(publicKey),
        "Ed25519",
        false,
        ["verify"],
    );
    if (
        !(await crypto.subtle.verify(
            "Ed25519",
            key,
            hexBytes(signature),
            signed,
        ))
    ) {
        return new Response(null, { status: 401 });
    }

    const body = new TextDecoder().decode(bytes);
    let interaction: Record<string, unknown> | null;
    try {
        interaction = JSON.parse(body);
    } catch {
        return new Response(null, { status: 400 });
    }
    if (interaction?.type === 1) return Response.json({ type: 1 });
    if (
        interaction?.type !== 2 ||
        typeof interaction.id !== "string" ||
        !/^\d{16,22}$/.test(interaction.id) ||
        typeof interaction.application_id !== "string" ||
        !/^\d{16,22}$/.test(interaction.application_id) ||
        typeof interaction.token !== "string" ||
        !/^[a-zA-Z0-9_.-]{1,512}$/.test(interaction.token)
    ) {
        return new Response(null, { status: 400 });
    }
    await enqueue({
        id: interaction.id,
        applicationId: interaction.application_id,
        token: interaction.token,
        body,
        expiresAt: Number(timestamp) * 1000 + 14 * 60_000,
    });
    return Response.json({ type: 5 });
}

export async function reportDiscordWakeFailure(job: DiscordJob) {
    const response = await fetch(
        `https://discord.com/api/v10/webhooks/${job.applicationId}/${job.token}/messages/@original`,
        {
            method: "PATCH",
            body: JSON.stringify({
                content:
                    "The sandbox could not handle this command. Please try again.",
            }),
            headers: { "content-type": "application/json" },
            redirect: "manual",
            signal: AbortSignal.timeout(5000),
        },
    );
    await response.body?.cancel();
}
