import {
    communityChatCompletionsUrl,
    normalizeCommunityEndpointBaseUrl,
} from "@shared/community-endpoints.ts";

type EndpointAuth = {
    baseUrl: string;
    bearerToken: string;
};

type EndpointTestInput = EndpointAuth & {
    model: string;
};

const REQUEST_TIMEOUT_MS = 10_000;

function communityModelsUrl(baseUrl: string): string {
    const normalized = normalizeCommunityEndpointBaseUrl(baseUrl);
    return normalized.endsWith("/chat/completions")
        ? `${normalized.slice(0, -"/chat/completions".length)}/models`
        : `${normalized}/models`;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error("Endpoint request timed out or could not connect");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(endpointErrorMessage(response.status, body));
    }
    return body;
}

function endpointErrorMessage(status: number, body: unknown): string {
    const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        body.error &&
        typeof body.error === "object" &&
        "message" in body.error &&
        typeof body.error.message === "string"
            ? body.error.message
            : null;
    return message
        ? `Endpoint responded ${status}: ${message}`
        : `Endpoint responded ${status}`;
}

export async function listCommunityEndpointModels({
    baseUrl,
    bearerToken,
}: EndpointAuth): Promise<string[]> {
    const body = await fetchJson(communityModelsUrl(baseUrl), {
        headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const models =
        body &&
        typeof body === "object" &&
        "data" in body &&
        Array.isArray(body.data)
            ? body.data
                  .map((model) =>
                      model &&
                      typeof model === "object" &&
                      "id" in model &&
                      typeof model.id === "string"
                          ? model.id
                          : null,
                  )
                  .filter((id): id is string => Boolean(id))
            : [];
    if (models.length === 0) {
        throw new Error("Endpoint did not return any OpenAI models");
    }
    return Array.from(new Set(models)).sort();
}

export async function testCommunityEndpoint({
    baseUrl,
    bearerToken,
    model,
}: EndpointTestInput): Promise<void> {
    const body = await fetchJson(communityChatCompletionsUrl(baseUrl), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with OK." }],
            max_tokens: 1,
            stream: false,
        }),
    });

    if (
        !body ||
        typeof body !== "object" ||
        !("choices" in body) ||
        !Array.isArray(body.choices)
    ) {
        throw new Error("Endpoint did not return OpenAI chat choices");
    }
}
