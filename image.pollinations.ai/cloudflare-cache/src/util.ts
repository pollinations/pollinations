import type { Context } from "hono";

type Defined<T> = {
    [P in keyof T as T[P] extends undefined ? never : P]: NonNullable<T[P]>;
};

export function removeUndefined<T extends object>(obj: T): Defined<T> {
    const newObj = Object.fromEntries(
        Object.entries(obj).filter(
            ([_, value]) => value !== undefined && value !== null,
        ),
    );
    return newObj as Defined<T>;
}

/**
 * Helper function to set HTTP metadata headers from R2 object
 * @param {Context} c - Hono context object
 * @param {Object} httpMetadata - R2 object httpMetadata
 */
export function setHttpMetadataHeaders(
    c: Context,
    httpMetadata?: R2HTTPMetadata,
) {
    if (httpMetadata) {
        // Iterate over all httpMetadata and set headers
        for (const [key, value] of Object.entries(httpMetadata)) {
            if (!value) continue;
            // Convert camelCase to kebab-case for HTTP headers
            const headerName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            c.header(headerName, value);
        }
    } else {
        // Fallback to default content type
        c.header("Content-Type", "image/jpeg");
    }
}

/**
 * Create a simple hash for Vectorize ID (using Web Crypto API)
 * @param {string} input - Input string to hash
 * @returns {Promise<string>} - Hash string
 */
export async function createSimpleHash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex.substring(0, 32); // Return first 32 chars
}

/**
 * Extract prompt from URL path for semantic caching
 * @param {URL} url - Request URL
 * @returns {string|null} - Extracted prompt or null
 */
export function extractPromptFromUrl(url: URL): string | null {
    try {
        // Extract prompt from path like /prompt/sunset+over+ocean
        const pathMatch = url.pathname.match(/^\/prompt\/(.+)$/);
        if (pathMatch) {
            // Decode the prompt, but do not replace '+' with spaces in the path
            const prompt = decodeURIComponent(pathMatch[1]).trim();
            return prompt || null;
        }

        // Extract prompt from query parameter
        const promptParam = url.searchParams.get("prompt");
        if (promptParam) {
            return promptParam.trim() || null;
        }

        return null;
    } catch (error) {
        console.error("[UTIL] Error extracting prompt from URL:", error);
        return null;
    }
}

/**
 * A tagged template function to dedent a multi-line string.
 * It finds the minimum indentation of all non-empty lines
 * and removes that amount of indentation from every line.
 * @example
 * const message = dedent`
 *   Hello World!
 *   This is a test.
 * `;
 * // message is "Hello World!\nThis is a test."
 */
export function dedent(
    strings: TemplateStringsArray,
    ...values: unknown[]
): string {
    // Interleave the static strings with the interpolated values.
    const fullString = strings
        .reduce((acc, str, i) => `${acc}${str}${values[i] || ""}`, "")
        .trim();

    // Find the smallest indentation.
    const lines = fullString.split("\n");
    let minIndent: number | null = null;

    for (const line of lines) {
        const match = line.match(/^(\s+)/);
        if (match) {
            const indent = match[1].length;
            if (minIndent === null || indent < minIndent) {
                minIndent = indent;
            }
        }
    }

    // If there's a common indent, remove it from all lines.
    if (minIndent !== null) {
        const dedented = lines
            .map((line) =>
                line.startsWith(" ".repeat(minIndent))
                    ? line.slice(minIndent)
                    : line,
            )
            .join("\n");
        return dedented.trim();
    }

    // Fallback for strings with no indentation
    return fullString;
}
