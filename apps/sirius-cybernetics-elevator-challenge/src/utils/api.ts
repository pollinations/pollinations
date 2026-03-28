import { getStoredApiKey, getStoredModel } from "@/hooks/ui";
import {
    API_CONFIG,
    type PollingsMessage,
    type PollingsResponse,
} from "@/types";

function createFetchRequest(
    messages: PollingsMessage[],
    jsonMode = true,
): RequestInit {
    const apiKey = getStoredApiKey();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    return {
        method: "POST",
        headers,
        body: JSON.stringify({
            messages,
            model: getStoredModel(),
            response_format: jsonMode ? { type: "json_object" } : undefined,
            seed: Math.floor(Math.random() * 1000000),
        }),
    };
}

const FALLBACK_RESPONSE: PollingsResponse = {
    choices: [
        {
            message: {
                content: JSON.stringify({
                    message:
                        "I apologize, but I'm having trouble processing your request right now.",
                    action: "none",
                }),
            },
        },
    ],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const retryFetch = async (
    operation: () => Promise<Response>,
    maxAttempts = API_CONFIG.MAX_RETRIES,
): Promise<PollingsResponse> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await operation();
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);

            const data = await response.json();
            return data as PollingsResponse;
        } catch (error) {
            lastError = error as Error;
            console.warn(
                `Attempt ${attempt + 1}/${maxAttempts} failed:`,
                error,
            );

            if (attempt < maxAttempts - 1) {
                await delay(API_CONFIG.RETRY_DELAY * 2 ** attempt);
            }
        }
    }

    console.error(`All ${maxAttempts} attempts failed. Last error:`, lastError);
    return FALLBACK_RESPONSE;
};

export const fetchFromPollinations = async (
    messages: PollingsMessage[],
    jsonMode = true,
): Promise<PollingsResponse> => {
    try {
        return await retryFetch(() =>
            fetch(API_CONFIG.ENDPOINT, createFetchRequest(messages, jsonMode)),
        );
    } catch (error) {
        console.error("Error in fetchFromPollinations:", error);
        return FALLBACK_RESPONSE;
    }
};
