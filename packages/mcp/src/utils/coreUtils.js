import { getAuthHeaders } from "./authUtils.js";

export const API_BASE_URL = "https://gen.pollinations.ai";

export function createMCPResponse(content) {
    return { content };
}

export function createTextContent(text, stringify = false) {
    return {
        type: "text",
        text: stringify ? JSON.stringify(text, null, 2) : text,
    };
}

export function createImageContent(data, mimeType) {
    return {
        type: "image",
        data,
        mimeType,
    };
}

export function createAudioContent(data, mimeType) {
    return {
        type: "audio",
        data,
        mimeType,
    };
}

export function buildUrl(path, params = {}) {
    const url = new URL(path, API_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
}

export async function fetchWithAuth(url, options = {}) {
    const { timeoutMs = 30000, ...fetchOptions } = options;
    return fetch(url, {
        ...fetchOptions,
        headers: { ...fetchOptions.headers, ...getAuthHeaders() },
        signal: AbortSignal.timeout(timeoutMs),
    });
}

export async function fetchJsonWithAuth(url, options = {}) {
    const response = await fetchWithAuth(url, options);
    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }
    return response.json();
}

export async function postChatCompletion(body) {
    const response = await fetchWithAuth(
        `${API_BASE_URL}/v1/chat/completions`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            timeoutMs: 30000,
        },
    );

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }

    return response;
}

export async function fetchBinaryWithAuth(url, options = {}) {
    const response = await fetchWithAuth(url, options);
    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }
    const buffer = await response.arrayBuffer();
    const contentType =
        response.headers.get("content-type") || "application/octet-stream";
    return { buffer, contentType };
}

export function arrayBufferToBase64(buffer) {
    return Buffer.from(buffer).toString("base64");
}

export function parseApiError(status, errorText) {
    let parsed;
    try {
        parsed = JSON.parse(errorText);
    } catch {}
    const error =
        parsed?.error?.message || parsed?.message || parsed?.error || errorText;
    const message = typeof error === "string" ? error : JSON.stringify(error);
    return `Request failed (${status}): ${message}`;
}
