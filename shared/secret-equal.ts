const encoder = new TextEncoder();

const digest = async (value: string) =>
    new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    );

/**
 * Compare a presented secret with the expected one in constant time. Hashing
 * first gives equal-length inputs, so neither content nor length leaks.
 */
export async function secretEquals(
    presented: string,
    expected: string,
): Promise<boolean> {
    const [a, b] = await Promise.all([digest(presented), digest(expected)]);
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
    return mismatch === 0;
}
