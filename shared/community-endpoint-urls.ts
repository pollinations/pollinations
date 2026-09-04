export function validateCommunityEndpointUrl(value: string): string {
    if (value !== value.trim()) {
        throw new Error("Endpoint URL cannot include surrounding whitespace");
    }
    const url = new URL(value);
    if (url.protocol !== "https:") {
        throw new Error("Endpoint URL must use https");
    }
    if (url.username || url.password) {
        throw new Error("Endpoint URL cannot include credentials");
    }
    if (isBlockedHostname(url.hostname)) {
        throw new Error("Endpoint URL cannot target a private host");
    }
    if (url.hash) {
        throw new Error("Endpoint URL cannot include a fragment");
    }
    return value;
}

export function normalizeCommunityAssetUrl(
    value: string,
    endpointBaseUrl: string,
): string {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Image URL must use http or https");
    }
    if (url.username || url.password || isBlockedHostname(url.hostname)) {
        throw new Error("Image URL cannot target a private host");
    }
    if (
        url.protocol === "http:" &&
        url.hostname !== new URL(endpointBaseUrl).hostname
    ) {
        throw new Error("HTTP image URL must use the endpoint host");
    }
    url.hash = "";
    return url.toString();
}

export function communityChatCompletionsUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/chat/completions");
}

export function communityResponsesUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/responses");
}

export function communityImageGenerationsUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/images/generations");
}

export function communityImageEditsUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/images/edits");
}

export function communityAudioTranscriptionsUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/audio/transcriptions");
}

export function communityEmbeddingsUrl(baseUrl: string): string {
    return communityOpenAIEndpointUrl(baseUrl, "/embeddings");
}

export function communityOpenAIBaseUrl(baseUrl: string): string {
    const validated = validateCommunityEndpointUrl(baseUrl);
    const url = new URL(validated);
    const suffix = configuredCommunityEndpointSuffix(url);
    if (!suffix) return validated;
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.slice(0, -suffix.length);
    return url.toString();
}

const COMMUNITY_OPENAI_ENDPOINT_SUFFIXES = [
    "/chat/completions",
    "/images/generations",
    "/images/edits",
    "/audio/transcriptions",
    "/embeddings",
    "/responses",
] as const;

function configuredCommunityEndpointSuffix(url: URL): string | undefined {
    const pathname = url.pathname.replace(/\/+$/, "");
    return COMMUNITY_OPENAI_ENDPOINT_SUFFIXES.find((suffix) =>
        pathname.endsWith(suffix),
    );
}

function communityOpenAIEndpointUrl(baseUrl: string, suffix: string): string {
    const validated = validateCommunityEndpointUrl(baseUrl);
    if (configuredCommunityEndpointSuffix(new URL(validated)) === suffix) {
        return validated;
    }
    const url = new URL(communityOpenAIBaseUrl(validated));
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${suffix}`;
    return url.toString();
}

function isBlockedHostname(hostname: string): boolean {
    const host = hostname
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "")
        .toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local")) return true;
    if (host.includes(":")) return true;
    if (host.startsWith("127.") || host.startsWith("10.")) return true;
    if (host.startsWith("169.254.")) return true;
    if (host.startsWith("100.")) {
        const second = Number(host.split(".")[1]);
        if (second >= 64 && second <= 127) return true;
    }
    if (host.startsWith("192.168.")) return true;
    const ipv4 = host.split(".").map(Number);
    if (
        ipv4.length === 4 &&
        ipv4.every(
            (part) => Number.isInteger(part) && part >= 0 && part <= 255,
        ) &&
        (ipv4[0] === 0 ||
            (ipv4[0] ?? 0) >= 224 ||
            (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19)))
    ) {
        return true;
    }
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }
    return false;
}
