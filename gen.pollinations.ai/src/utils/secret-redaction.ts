const REDACTED_SECRET_KEY = "{SECRET_KEY}";
const REDACTED_PUBLIC_KEY = "{PUBLIC_KEY}";
const REDACTED_BEARER_TOKEN = "{BEARER_TOKEN}";

const SECRET_KEY_PATTERN = /\bsk_[A-Za-z0-9][A-Za-z0-9_-]{6,}/g;
const PUBLIC_KEY_PATTERN = /\bpk_[A-Za-z0-9][A-Za-z0-9_-]{6,}/g;
const BEARER_TOKEN_PATTERN =
    /\bBearer\s+([A-Za-z0-9._~+/=-]|%[0-9A-Fa-f]{2}){8,}/gi;
const MAX_PENDING_LENGTH = 1024;

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

            if (pending.length > MAX_PENDING_LENGTH) {
                controller.enqueue(encoder.encode(redactSecretString(pending)));
                pending = "";
                return;
            }

            const anchorIdx = Math.max(
                pending.lastIndexOf("sk_"),
                pending.lastIndexOf("pk_"),
                pending.toLowerCase().lastIndexOf("bearer"),
            );

            if (anchorIdx === -1) {
                controller.enqueue(encoder.encode(redactSecretString(pending)));
                pending = "";
            } else if (anchorIdx > 0) {
                const safePart = pending.slice(0, anchorIdx);
                controller.enqueue(
                    encoder.encode(redactSecretString(safePart)),
                );
                pending = pending.slice(anchorIdx);
            }
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
