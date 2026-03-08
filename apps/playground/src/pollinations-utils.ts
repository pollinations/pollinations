/**
 * Generate a seed value for reproducible generation.
 * Uses the provided seed, or falls back to -1 for true randomness.
 * According to Pollinations API: seed=-1 gives true random results (no caching).
 *
 * @param providedSeed - Seed from call options (e.g., from generateText, generateImage)
 * @returns A seed value, or -1 for true randomness if no seed provided
 */
export function resolveSeed(providedSeed?: number): number {
  if (providedSeed !== undefined && providedSeed !== null) {
    return providedSeed;
  }
  const maxInt32 = Math.pow(2, 31) - 1;
  return Date.now() % maxInt32;
}

/**
 * Check if a string is valid base64
 * @param str - The string to validate
 * @returns True if the string is valid base64
 */
function isBase64(str: string): boolean {
  if (!str || str.length === 0) {
    return false;
  }
  // Base64 should only contain A-Z, a-z, 0-9, +, /, and = for padding
  // Length should be a multiple of 4
  return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length % 4 === 0;
}

/**
 * Convert data to base64 string (browser-compatible)
 * Works in both Node.js and browser environments
 *
 * @param data - The data to convert (string, Uint8Array, or ArrayBuffer)
 * @returns Base64 encoded string
 */
export function toBase64(data: string | Uint8Array | ArrayBuffer): string {
  // Handle string input
  if (typeof data === 'string') {
    // Check if it's already a valid base64 string
    if (isBase64(data)) {
      return data; // Already base64, return as-is
    }

    // Not base64, convert string to base64
    const globalBuffer = (globalThis as any).Buffer;
    if (typeof globalBuffer !== 'undefined' && globalBuffer.from) {
      // Node.js: use Buffer
      return globalBuffer.from(data, 'utf-8').toString('base64');
    }

    // Browser: convert UTF-8 string to base64
    // Use TextEncoder if available (modern browsers)
    if (typeof TextEncoder !== 'undefined') {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);
      const binary = String.fromCharCode(...uint8Array);
      return btoa(binary);
    }

    // Fallback: use encodeURIComponent for UTF-8 encoding
    const utf8Bytes: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      if (code < 0x80) {
        utf8Bytes.push(code);
      } else if (code < 0x800) {
        utf8Bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        utf8Bytes.push(
          0xe0 | (code >> 12),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    }
    return btoa(String.fromCharCode(...utf8Bytes));
  }

  // Handle ArrayBuffer or Uint8Array
  const uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  // Check if Buffer is available (Node.js environment)
  const globalBuffer = (globalThis as any).Buffer;
  if (typeof globalBuffer !== 'undefined' && globalBuffer.from) {
    return globalBuffer.from(uint8Array).toString('base64');
  }

  // Browser-compatible conversion using Uint8Array and btoa
  // Process in chunks to avoid call stack overflow for large arrays
  const chunkSize = 8192;
  const chunks: string[] = [];

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    // Use apply to avoid spreading large arrays
    const binary = String.fromCharCode.apply(
      null,
      Array.from(chunk) as unknown as number[],
    );
    chunks.push(binary);
  }

  return btoa(chunks.join(''));
}
