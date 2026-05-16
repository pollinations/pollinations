const REDACTED_SECRET_KEY = "{SECRET_KEY}";
const REDACTED_PUBLIC_KEY = "{PUBLIC_KEY}";
const REDACTED_BEARER_TOKEN = "{BEARER_TOKEN}";

const SECRET_KEY_PATTERN = /\bsk_[A-Za-z0-9][A-Za-z0-9_-]{6,}/g;
const PUBLIC_KEY_PATTERN = /\bpk_[A-Za-z0-9][A-Za-z0-9_-]{6,}/g;
const BEARER_TOKEN_PATTERN =
    /\bBearer\s+([A-Za-z0-9._~+/=-]|%[0-9A-Fa-f]{2}){8,}/gi;
const STREAM_TAIL_LENGTH = 4096;

export function redactSecrets(text: string): string;
export function redactSecrets<T>(value: T): T;
export function redactSecrets(value: unknown): unknown {
    if (typeof value === "string") return redactSecretString(value);
    if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key,
            redactSecrets(entry),
        ]),
    );
}

export function createSecretRedactionStream(): TransformStream<
    Uint8Array,
    Uint8Array
> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let pending = "";

    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            pending += decoder.decode(chunk, { stream: true });
            if (pending.length <= STREAM_TAIL_LENGTH) return;

            const safeLength = pending.length - STREAM_TAIL_LENGTH;
            controller.enqueue(
                encoder.encode(
                    redactSecretString(pending.slice(0, safeLength)),
                ),
            );
            pending = pending.slice(safeLength);
        },
        flush(controller) {
            const finalText = decoder.decode();
            if (finalText) pending += finalText;
            if (pending)
                controller.enqueue(encoder.encode(redactSecretString(pending)));
        },
    });
}

function redactSecretString(value: string): string {
    return value
        .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_BEARER_TOKEN}`)
        .replace(SECRET_KEY_PATTERN, REDACTED_SECRET_KEY)
        .replace(PUBLIC_KEY_PATTERN, REDACTED_PUBLIC_KEY);
}
