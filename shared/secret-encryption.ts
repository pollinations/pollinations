const VERSION = "v1";

export async function encryptSecret(
    plaintext: string,
    secret: string,
): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(secret);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(plaintext),
        ),
    );
    return `${VERSION}:${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

export async function decryptSecret(
    encrypted: string,
    secret: string,
): Promise<string> {
    const [version, ivBase64, ciphertextBase64] = encrypted.split(":");
    if (version !== VERSION || !ivBase64 || !ciphertextBase64) {
        throw new Error("Unsupported encrypted secret format");
    }
    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
        key,
        base64ToBytes(ciphertextBase64),
    );
    return new TextDecoder().decode(plaintext);
}

async function deriveKey(secret: string): Promise<CryptoKey> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(secret),
    );
    return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
        "encrypt",
        "decrypt",
    ]);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
