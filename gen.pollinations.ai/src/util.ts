const RANDOM_ID_ALPHABET =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateRandomId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(
        bytes,
        (byte) => RANDOM_ID_ALPHABET[byte % RANDOM_ID_ALPHABET.length],
    ).join("");
}

export function safeRound(amount: number, precision: number = 6): number {
    if (!Number.isFinite(amount) || Number.isNaN(amount)) {
        return 0;
    }
    if (Math.abs(amount) < 10 ** -(precision + 2)) {
        return 0;
    }
    const factor = 10 ** precision;
    return Math.round(amount * factor) / factor;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
}
