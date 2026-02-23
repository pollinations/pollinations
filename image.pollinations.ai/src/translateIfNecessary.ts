import AsyncLock from "async-lock";
import debug from "debug";
import { getNextTranslationServerUrl } from "./availableServers.js";

const lock = new AsyncLock();
const logError = debug("pollinations:error");
const logPerf = debug("pollinations:perf");
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

export async function translateIfNecessary(promptAnyLanguage: string) {
    // convert underscores and - etc to spaces
    promptAnyLanguage = promptAnyLanguage.replace(/[-_]/g, " ");

    return lock.acquire("translate", async () => {
        promptAnyLanguage = `${promptAnyLanguage}`;
        try {
            const translateStart = Date.now();
            const detectedLanguage = await detectLanguage(promptAnyLanguage);

            if (detectedLanguage === "en") {
                return promptAnyLanguage;
            }

            const controller = new AbortController();
            const translatePromise = fetchTranslation(
                promptAnyLanguage,
                controller.signal,
            );
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    controller.abort();
                    resolve(null);
                }, 1000);
            });

            const result = await Promise.race([
                translatePromise,
                timeoutPromise,
            ]);

            if (result) {
                logTranslate(
                    "translate input",
                    promptAnyLanguage,
                    "translateResult",
                    result,
                );
                const translatedPrompt = (result as any).translatedText;
                const translateEnd = Date.now();
                logPerf(
                    `Translation duration: ${translateEnd - translateStart}ms`,
                );
                logTranslate(
                    "translated prompt to english ",
                    promptAnyLanguage,
                    "---",
                    translatedPrompt,
                );

                return `${translatedPrompt}\n\n${promptAnyLanguage}`;
            } else {
                return promptAnyLanguage;
            }
        } catch (e) {
            logError("error translating", e.message);
            return promptAnyLanguage;
        }
    });
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

async function fetchTranslation(
    promptAnyLanguage: string,
    signal: AbortSignal,
) {
    try {
        const host = await getNextTranslationServerUrl();
        const result = await fetch(`${host}/translate`, {
            method: "POST",
            body: JSON.stringify({
                q: promptAnyLanguage,
                source: "auto",
                target: "en",
            }),
            headers: { "Content-Type": "application/json" },
            signal,
        });

        const resultJson = await result.json();

        return resultJson;
    } catch (e) {
        logError("error fetching translation", e.message);
        return null;
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
