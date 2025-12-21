import { createMCPResponse, createTextContent } from "../utils/coreUtils.js";
import {
    setApiKey as storeApiKey,
    getApiKey,
    clearApiKey as clearStoredKey,
    hasApiKey,
    getKeyType,
    getMaskedKey,
} from "../utils/authUtils.js";
import { z } from "zod";

async function setApiKey(params) {
    const { key } = params;

    if (!key || typeof key !== "string") {
        throw new Error("API key is required and must be a string");
    }

    if (!key.startsWith("pk_") && !key.startsWith("sk_")) {
        throw new Error(
            "Invalid API key format. Keys should start with 'pk_' (publishable) or 'sk_' (secret)"
        );
    }

    storeApiKey(key);

    const keyType = getKeyType();
    const maskedKey = getMaskedKey();

    return createMCPResponse([
        createTextContent({
            success: true,
            keyType,
            maskedKey,
            message: `API key set successfully. Type: ${keyType}`,
            info: keyType === "publishable"
                ? "Publishable keys are rate-limited (3 req/burst, 1/15sec refill)"
                : "Secret keys have no rate limits and can spend Pollen",
        }, true),
    ]);
}

async function getKeyInfo(params) {
    if (!hasApiKey()) {
        return createMCPResponse([
            createTextContent({
                authenticated: false,
                message: "No API key set. Use setApiKey to authenticate.",
                info: "Get your API key at https://pollinations.ai",
            }, true),
        ]);
    }

    const keyType = getKeyType();
    const maskedKey = getMaskedKey();

    return createMCPResponse([
        createTextContent({
            authenticated: true,
            keyType,
            maskedKey,
            info: keyType === "publishable"
                ? "Publishable keys are rate-limited (3 req/burst, 1/15sec refill)"
                : "Secret keys have no rate limits and can spend Pollen",
        }, true),
    ]);
}

async function clearApiKey(params) {
    const wasSet = hasApiKey();
    clearStoredKey();

    return createMCPResponse([
        createTextContent({
            success: true,
            message: wasSet
                ? "API key cleared successfully"
                : "No API key was set",
        }, true),
    ]);
}

export const authTools = [
    [
        "setApiKey",
        "Set your Pollinations API key for authenticated requests. Get your key at https://pollinations.ai",
        {
            key: z.string().describe(
                "Your API key (pk_ for publishable, sk_ for secret)"
            ),
        },
        setApiKey,
    ],

    [
        "getKeyInfo",
        "Get information about the currently set API key",
        {},
        getKeyInfo,
    ],

    [
        "clearApiKey",
        "Clear the stored API key",
        {},
        clearApiKey,
    ],
];
