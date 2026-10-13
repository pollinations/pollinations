import timers from "node:timers/promises";

export const transientHttp = (status) =>
    [408, 429].includes(status) || (status >= 500 && status < 600);
export const transientNetwork = (error) =>
    ["TimeoutError", "AbortError"].includes(error?.name) ||
    (error instanceof TypeError &&
        /fetch failed|terminated|network/i.test(error.message));

export function retryDelay(headers, attempt) {
    const value = headers?.get("retry-after");
    const requested = value
        ? /^\d+(?:\.\d+)?$/.test(value.trim())
            ? Number(value) * 1000
            : Date.parse(value) - Date.now()
        : 0;
    if (Number.isFinite(requested) && requested > 30000)
        throw new Error("Server retry delay exceeds the 30-second retry bound");
    return Math.max(attempt * 2000, Number.isFinite(requested) ? requested : 0);
}

export async function readJsonWithRetries(
    url,
    options = {},
    fetch = globalThis.fetch,
) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        let retryable = false;
        let delay = attempt * 2000;
        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(30000),
            });
            if (transientHttp(response.status)) {
                delay = retryDelay(response.headers, attempt);
                retryable = true;
            }
            if (!response.ok) throw new Error(`Read HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if ((!retryable && !transientNetwork(error)) || attempt === 3)
                throw error;
            await timers.setTimeout(delay);
        }
    }
}
