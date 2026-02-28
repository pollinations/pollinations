import debug from "debug";
import { getNextTranslationServerUrl } from "./availableServers.js";

const logError = debug("pollinations:error");
const logTranslate = debug("pollinations:translate");

export async function detectLanguage(promptAnyLanguage: string) {
    const controller = new AbortController();
    const detectPromise = fetchDetection(promptAnyLanguage, controller.signal);
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            controller.abort();
            resolve(null);
        }, 1000);
    });

    return Promise.race([detectPromise, timeoutPromise]);
}

async function fetchDetection(promptAnyLanguage: string, signal: AbortSignal) {
    try {
        const host = await getNextTranslationServerUrl();
        const result = await fetch(`${host}/detect`, {
            method: "POST",
            body: JSON.stringify({
                q: promptAnyLanguage,
            }),
            headers: { "Content-Type": "application/json" },
            signal,
        });

        const resultJson = await result.json();

        return resultJson[0]?.language;
    } catch (e) {
        logError("error fetching detection", e.message);
        return "en";
    }
}

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
