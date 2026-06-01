import debug from "debug";

const logTranslate = debug("pollinations:translate");

// Function to sanitize a string to ensure it contains valid UTF-8 characters
export function sanitizeString(str: string) {
    if (!str) return str;

    logTranslate("sanitizeString", str);

    // Only remove control characters while preserving valid Unicode characters
    // biome-ignore lint/suspicious: this is ok
    const sanitized = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    logTranslate("sanitized", sanitized);
    return sanitized;
}
