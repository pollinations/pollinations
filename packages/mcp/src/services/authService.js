import { createMCPResponse, createTextContent } from \"../utils/coreUtils.js\";
import {
    setApiKey as storeApiKey,
    getApiKey,
    clearApiKey as clearStoredKey,
    hasApiKey,
    getKeyType,
    getMaskedKey,
} from \"../utils/authUtils.js\";
import { clearModelCache } from \"../utils/modelCache.js\";
import { z } from \"zod\";

async function setApiKey(params) {
    const { key } = params;

    if (!key || typeof key !== \"string\") {
        throw new Error(\"API key is required and must be a string\");
    }

    if (!key.startsWith(\"pk_\") && !key.startsWith(\"sk_\")) {
        throw new Error(
            \"Invalid API key format. Keys should start with 'pk_' (publishable) or 'sk_' (secret)\",
        );
    }

    storeApiKey(key);

    // Invalidate the model cache when API key changes to refresh available models list
    clearModelCache();

    const keyType = getKeyType();
    const maskedKey = getMaskedKey();

    return createMCPResponse([
        createTextContent(
            {
                success: true,
                keyType,
                maskedKey,
                message: `API key set successfully. Type: ${keyType}. Model cache cleared.`,
                info:
                    keyType === \"publishable\"
                        ? \"Publishable keys are rate-limited (1 pollen per IP per hour)\"
                        : \"Secret keys have no rate limits and can spend Pollen\",
            },
            true,
        ),
    ]);
}

async function getKeyInfo(params) {
    if (!hasApiKey()) {
        return createMCPResponse([
            createTextContent(
                {
                    authenticated: false,
                    message: \"No API key set. Use setApiKey to authenticate.\",
                    info: \"Get your API key at https://enter.pollinations.ai\",
                },
                true,
            ),
        ]);
    }

    const keyType = getKeyType();
    const maskedKey = getMaskedKey();

    return createMCPResponse([
        createTextContent(
            {
                authenticated: true,
                keyType,
                maskedKey,
                info:
                    keyType === \"publishable\"
                        ? \"Publishable keys are rate-limited (1 pollen per IP per hour)\"
                        : \"Secret keys have no rate limits and can spend Pollen\",
            },
            true,
        ),
    ]);
}

async function clearApiKey(params) {
    const wasSet = hasApiKey();
    clearStoredKey();
    
    // Invalidate the model cache when API key is removed
    clearModelCache();

    return createMCPResponse([
        createTextContent(
            {
                success: true,
                message: wasSet
                    ? \"API key cleared successfully. Model cache cleared.\"
                    : \"No API key was set\",
            },
            true,
        ),
    ]);
}

export const authTools = [
    [
        \"setApiKey\",
        \"Set your pollinations.ai API key for authenticated requests. Get your key at https://enter.pollinations.ai\",
        {
            key: z
                .string()
                .describe(\"Your API key (pk_ for publishable, sk_ for secret)\"),
        },
        setApiKey,
    ],

    [
        \"getKeyInfo\",\n        \"Get information about the currently set API key\",\n        {},\n        getKeyInfo,\n    ],\n\n    [\"clearApiKey\", \"Clear the stored API key\", {}, clearApiKey],\n];\n