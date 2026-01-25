/**
 * Simple hashing utilities for cache keys and deduplication
 */

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Simple string hash for cache keys (non-cryptographic)
 * Much faster than SHA-256 for non-security use cases
 */
export function simpleHash(str: string): string {
    // Simple hash using btoa (base64) and cleaning
    // Good enough for cache keys, much faster than SHA-256
    try {
        return btoa(str)
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 32); // Limit length for readability
    } catch {
        // Fallback for strings with non-Latin characters
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
}

/**
 * Create cache key from parts - simple concatenation and hashing
 */
export function createCacheKey(...parts: (string | number | boolean)[]): string {
    const combined = parts.join('|');
    return `cache_${simpleHash(combined)}`;
}