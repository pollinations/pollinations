import fetch from "node-fetch";
import AsyncLock from 'async-lock';
import debug from 'debug';

const lock = new AsyncLock();
const logError = debug('pollinations:error');
const logTranslate = debug('pollinations:translate');

// Get translation server URL from environment or use default
const TRANSLATION_SERVER = process.env.TRANSLATION_SERVER || 'http://localhost:5000';

export async function detectLanguage(text) {
    const controller = new AbortController();
    const detectPromise = fetchDetection(text, controller.signal);
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            controller.abort();
            resolve(null);
        }, 1000);
    });

    return Promise.race([detectPromise, timeoutPromise]);
}

export async function translateIfNecessary(text, targetLang = 'en') {
    return lock.acquire('translate', async () => {
        try {
            const controller = new AbortController();
            const translatePromise = fetchTranslation(text, targetLang, controller.signal);
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    controller.abort();
                    resolve(null);
                }, 2000);
            });

            const result = await Promise.race([translatePromise, timeoutPromise]);

            if (result) {
                logTranslate("translated text", { input: text, output: result.translatedText });
                return result.translatedText;
            }
            return text;
        } catch (e) {
            logError("error translating", e.message);
            return text;
        }
    });
}

async function fetchDetection(text, signal) {
    try {
        const result = await fetch(`${TRANSLATION_SERVER}/detect`, {
            method: "POST",
            body: JSON.stringify({ q: text }),
            headers: { "Content-Type": "application/json" },
            signal
        });

        const resultJson = await result.json();
        return resultJson[0]?.language;
    } catch (e) {
        logError("error detecting language", e.message);
        return null;
    }
}

async function fetchTranslation(text, targetLang, signal) {
    try {
        const result = await fetch(`${TRANSLATION_SERVER}/translate`, {
            method: "POST",
            body: JSON.stringify({
                q: text,
                source: targetLang === 'en' ? 'auto' : 'en',
                target: targetLang
            }),
            headers: { "Content-Type": "application/json" },
            signal
        });

        return await result.json();
    } catch (e) {
        logError("error fetching translation", e.message);
        return null;
    }
}