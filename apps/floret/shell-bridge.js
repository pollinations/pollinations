const AUTH_URL = "https://enter.pollinations.ai/api/account/key";
const AUTH_TIMEOUT_MS = 10_000;
const AUTH_MAX_BYTES = 16 * 1024;
const MAX_REQUEST_BYTES = 102 * 1024 * 1024 + 64 * 1024 + 4;
const MAX_LIFECYCLE_MS = 11 * 60 * 1000;

function token(request) {
    const match = /^Bearer\s+(ag_\S+)$/i.exec(
        (request.headers.get("Authorization") || "").trim(),
    );
    return match?.[1] || null;
}

async function boundedJson(response) {
    const length = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > AUTH_MAX_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > AUTH_MAX_BYTES) return null;
            chunks.push(value);
        }
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    } finally {
        await reader.cancel().catch(() => {});
    }
}

export async function authenticateRun(request, fetchImpl = globalThis.fetch) {
    const bearer = token(request);
    if (!bearer) return false;
    let response;
    try {
        response = await fetchImpl(AUTH_URL, {
            method: "GET",
            headers: { Authorization: `Bearer ${bearer}` },
            redirect: "error",
            signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        });
    } catch {
        return false;
    }
    if (response.status !== 200) return false;
    const body = await boundedJson(response);
    return body !== null && body.valid === true;
}

async function boundedText(response, maxBytes) {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks = [];
    let bytes = 0;
    while (bytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = maxBytes - bytes;
        chunks.push(value.subarray(0, remaining));
        bytes += Math.min(value.byteLength, remaining);
    }
    await reader.cancel().catch(() => {});
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

function errorResponse(status, message) {
    return Response.json(
        { error: message },
        { status, headers: { "Cache-Control": "no-store" } },
    );
}

function destroyAfterBody(response, destroy) {
    if (!response.body) return destroy().then(() => response);
    const reader = response.body.getReader();
    const body = new ReadableStream({
        async pull(controller) {
            try {
                const chunk = await reader.read();
                if (!chunk.done) {
                    controller.enqueue(chunk.value);
                    return;
                }
                await destroy();
                controller.close();
            } catch (error) {
                try {
                    await reader.cancel(error);
                } catch {
                    // Destruction remains mandatory after cancellation failure.
                } finally {
                    await destroy();
                    controller.error(error);
                }
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                await destroy();
            }
        },
    });
    return Promise.resolve(
        new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        }),
    );
}

export function createShellOutbound({
    fetchImpl = globalThis.fetch,
    getContainerImpl,
    uuidImpl = () => crypto.randomUUID(),
} = {}) {
    if (!getContainerImpl) throw new Error("getContainerImpl is required");
    return async function shellOutbound(request, env) {
        if (
            request.method !== "POST" ||
            new URL(request.url).pathname !== "/run"
        ) {
            return errorResponse(404, "Not found");
        }
        const contentLength = Number(request.headers.get("Content-Length"));
        if (
            !Number.isSafeInteger(contentLength) ||
            contentLength < 4 ||
            contentLength > MAX_REQUEST_BYTES
        ) {
            return errorResponse(413, "Invalid shell request size");
        }
        if (!(await authenticateRun(request, fetchImpl))) {
            return errorResponse(401, "Unauthorized");
        }

        if (request.signal.aborted) {
            return errorResponse(499, "Request cancelled");
        }
        const lifecycleSignal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(MAX_LIFECYCLE_MS),
        ]);
        let container;
        let destroyPromise;
        const destroy = () => {
            if (!destroyPromise) {
                destroyPromise = container?.destroy() || Promise.resolve();
            }
            return destroyPromise;
        };
        try {
            container = getContainerImpl(env.FLORET_SHELL, uuidImpl());
            await container.startAndWaitForPorts({
                cancellationOptions: { abort: lifecycleSignal },
            });
            if (lifecycleSignal.aborted) throw lifecycleSignal.reason;
            const response = await container.fetch(
                new Request("http://shell.internal/run", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "Content-Length": String(contentLength),
                    },
                    body: request.body,
                    duplex: "half",
                    signal: lifecycleSignal,
                }),
            );
            if (!response.ok) {
                const diagnostic = await boundedText(response, 8 * 1024);
                await destroy();
                return errorResponse(
                    response.status >= 500 ? 502 : response.status,
                    diagnostic || "Shell container rejected the request",
                );
            }
            return await destroyAfterBody(response, destroy);
        } catch {
            await destroy().catch(() => {});
            return errorResponse(502, "Shell container unavailable");
        }
    };
}

export const SHELL_CONTAINER_LIMITS = Object.freeze({
    authMaxBytes: AUTH_MAX_BYTES,
    maxRequestBytes: MAX_REQUEST_BYTES,
});
