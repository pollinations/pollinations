import { getAuthHeaders } from "./authUtils.js";

const DEFAULT_API_BASE_URL = "https://gen.pollinations.ai";
const configuredApiBaseUrl =
    typeof process !== "undefined"
        ? process.env?.POLLINATIONS_BASE_URL?.trim()
        : undefined;

export const API_BASE_URL = (
    configuredApiBaseUrl || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export function validateApiBaseUrl() {
    let url;
    try {
        url = new URL(API_BASE_URL);
    } catch {
        throw new Error(
            "Invalid POLLINATIONS_BASE_URL: expected an absolute HTTP(S) URL.",
        );
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            "Invalid POLLINATIONS_BASE_URL: expected an HTTP(S) origin without credentials, query, or fragment.",
        );
    }
    return API_BASE_URL;
}

export function createMCPResponse(content) {
    return { content };
}

export function createTextContent(value, stringify = false) {
    return {
        type: "text",
        text: stringify ? JSON.stringify(value, null, 2) : value,
    };
}

export function buildUrl(path, params = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${API_BASE_URL}${normalizedPath}`);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(
                key,
                Array.isArray(value) ? value.join("|") : String(value),
            );
        }
    }
    return url.toString();
}

export async function fetchWithAuth(url, options = {}, context) {
    const { timeoutMs = 30000, ...fetchOptions } = options;
    return fetch(url, {
        ...fetchOptions,
        headers: {
            ...fetchOptions.headers,
            ...getAuthHeaders(context),
        },
        signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs),
    });
}

export async function fetchResponseWithAuth(url, options = {}, context) {
    const response = await fetchWithAuth(url, options, context);
    if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        throw new Error(`Request failed (${response.status}): ${body}`);
    }
    return response;
}

export async function fetchJsonWithAuth(url, options = {}, context) {
    return (await fetchResponseWithAuth(url, options, context)).json();
}

export async function postChatCompletion(body, context) {
    return fetchJsonWithAuth(
        buildUrl("/v1/chat/completions"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        context,
    );
}

export function arrayBufferToBase64(buffer) {
    return Buffer.from(buffer).toString("base64");
}
