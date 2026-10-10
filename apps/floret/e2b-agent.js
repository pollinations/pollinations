import { AuthenticationError, Sandbox } from "e2b";
import { catalogOutbound } from "./gateway.js";
import sources from "./source-bundle.js";

const API_URL = "https://gen.pollinations.ai/alpha/e2b";
const LEASE_MS = 600_000;
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
};
const INSTALL =
    "sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg curl nodejs npm && python3 -m venv /home/user/floret/.venv && /home/user/floret/.venv/bin/pip install -q /home/user/floret";
const START =
    "/home/user/floret/.venv/bin/python -m uvicorn floret.api:app --host 0.0.0.0 --port 8000";
const READY =
    "for i in $(seq 1 100); do curl -sf http://127.0.0.1:8000/health >/dev/null && exit 0; sleep 0.1; done; exit 1";

// Only this run's files and caller credential enter the VM. No operator key.
export async function startRun(apiKey, snapshot, signal) {
    const sandbox = await Sandbox.create("base", {
        apiUrl: API_URL,
        apiKey,
        timeoutMs: LEASE_MS,
        network: { allowPublicTraffic: false },
        metadata: { app: "floret" },
        // An ambiguous create must not buy a second VM.
        retries: 0,
    });
    try {
        signal?.throwIfAborted();
        if (!sandbox.trafficAccessToken)
            throw new Error("Private sandbox traffic token missing");
        await sandbox.files.write(
            [
                ...sources,
                {
                    path: "/home/user/floret/catalog.json",
                    data: JSON.stringify(snapshot),
                },
            ],
            { signal },
        );
        await sandbox.commands.run(INSTALL, { timeoutMs: 180_000, signal });
        await sandbox.commands.run(START, {
            background: true,
            timeoutMs: 0,
            signal,
            envs: {
                POLLI_TEMP_DIR: "/home/user/workspace",
                POLLI_CATALOG_ENDPOINT: "file:///home/user/floret/catalog.json",
                POLLI_ALLOW_OPERATOR_KEY: "false",
                OPENAI_API_KEY: "",
                OPENAI_BASE_URL: "https://gen.pollinations.ai",
            },
        });
        await sandbox.commands.run(READY, { timeoutMs: 15_000, signal });
        return sandbox;
    } catch (error) {
        await sandbox.kill();
        throw error;
    }
}

function failure(error) {
    const status =
        error instanceof AuthenticationError
            ? 401
            : error.statusCode >= 400 && error.statusCode <= 503
              ? error.statusCode
              : 502;
    return {
        status,
        message:
            status === 403
                ? "Floret requires machines permission on the caller's key."
                : "Floret sandbox run failed.",
    };
}

export function createSandboxAgent(
    env,
    start = startRun,
    fetchImpl = globalThis.fetch,
) {
    return {
        async fetch(request, ctx) {
            const path = new URL(request.url).pathname;
            if (request.method === "OPTIONS")
                return new Response(null, { status: 204, headers: CORS });
            if (request.method === "GET") {
                if (path === "/health")
                    return Response.json({ status: "ok" }, { headers: CORS });
                if (path === "/v1/models")
                    return Response.json(
                        {
                            object: "list",
                            data: [
                                {
                                    id: "floret",
                                    object: "model",
                                    owned_by: "pollinations",
                                },
                            ],
                        },
                        { headers: CORS },
                    );
                if (path === "/" || path === "/v1/chat/completions")
                    return Response.json(
                        {
                            service: "floret",
                            chat: "POST /v1/chat/completions",
                            auth: "Authorization: Bearer <Pollinations key with machines permission>",
                        },
                        { headers: CORS },
                    );
            }
            if (path !== "/v1/chat/completions" || request.method !== "POST")
                return new Response("Not found", {
                    status: 404,
                    headers: CORS,
                });
            const key = request.headers
                .get("Authorization")
                ?.replace(/^Bearer\s+/i, "");
            if (!key)
                return Response.json(
                    { detail: "Missing API key." },
                    { status: 401, headers: CORS },
                );
            let body;
            try {
                body = await request.json();
                if (
                    !body ||
                    typeof body.model !== "string" ||
                    !Array.isArray(body.messages) ||
                    body.messages.some(
                        (m) =>
                            !m ||
                            typeof m.role !== "string" ||
                            !("content" in m),
                    ) ||
                    (body.stream !== undefined &&
                        typeof body.stream !== "boolean")
                )
                    throw new Error("Invalid chat request");
            } catch {
                return Response.json(
                    { detail: "Invalid chat request." },
                    { status: 422, headers: CORS },
                );
            }
            const snapshot = await catalogOutbound(
                new Request("http://floret-catalog.internal/snapshot"),
                env,
            );
            if (!snapshot.ok)
                return new Response(snapshot.body, {
                    status: snapshot.status,
                    headers: CORS,
                });
            const controller = new AbortController();
            let sandbox;
            let renew;
            let stopped;
            const cleanup = () => {
                clearInterval(renew);
                if (sandbox) stopped ??= sandbox.kill();
                return stopped;
            };
            const abort = () => controller.abort();
            request.signal.addEventListener("abort", abort, { once: true });
            if (request.signal.aborted) abort();
            const open = async () => {
                sandbox = await start(
                    key,
                    await snapshot.json(),
                    controller.signal,
                );
                controller.signal.throwIfAborted();
                renew = setInterval(() => {
                    sandbox
                        .setTimeout(LEASE_MS)
                        .catch(() =>
                            controller.abort(
                                new Error("Sandbox lease renewal failed"),
                            ),
                        );
                }, LEASE_MS / 2);
                return fetchImpl(
                    `https://${sandbox.getHost(8000)}/v1/chat/completions`,
                    {
                        method: "POST",
                        redirect: "manual",
                        signal: controller.signal,
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${key}`,
                            "e2b-traffic-access-token":
                                sandbox.trafficAccessToken,
                        },
                        body: JSON.stringify(body),
                    },
                );
            };
            if (!body.stream) {
                try {
                    const response = await open();
                    return new Response(await response.arrayBuffer(), {
                        status: response.status,
                        headers: {
                            ...CORS,
                            "Content-Type":
                                response.headers.get("content-type") ||
                                "application/json",
                        },
                    });
                } catch (error) {
                    const { status, message } = failure(error);
                    return Response.json(
                        { detail: message },
                        { status, headers: CORS },
                    );
                } finally {
                    request.signal.removeEventListener("abort", abort);
                    await cleanup();
                }
            }
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            writer.closed.catch(() => {
                controller.abort();
                cleanup()?.catch(() =>
                    console.error("Floret sandbox cleanup failed"),
                );
            });
            const encoder = new TextEncoder();
            const send = (text) => writer.write(encoder.encode(text));
            const pump = (async () => {
                const keepalive = setInterval(() => {
                    if (writer.desiredSize > 0)
                        send(": keepalive\n\n").catch(() => controller.abort());
                }, 15_000);
                try {
                    await send(": starting sandbox\n\n");
                    const response = await open();
                    clearInterval(keepalive);
                    if (!response.ok || !response.body) {
                        await send(
                            "data: " +
                                JSON.stringify({
                                    error: {
                                        message: "Floret returned an error.",
                                        code: response.status,
                                    },
                                }) +
                                "\n\ndata: [DONE]\n\n",
                        );
                    } else {
                        const reader = response.body.getReader();
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                await writer.write(value);
                            }
                        } finally {
                            await reader.cancel();
                        }
                    }
                } catch (error) {
                    const { status, message } = failure(error);
                    try {
                        await send(
                            "data: " +
                                JSON.stringify({
                                    error: { message, code: status },
                                }) +
                                "\n\ndata: [DONE]\n\n",
                        );
                    } catch {
                        /* Client disconnected. */
                    }
                } finally {
                    clearInterval(keepalive);
                    request.signal.removeEventListener("abort", abort);
                    try {
                        await cleanup();
                    } finally {
                        await writer.close().catch(() => {});
                    }
                }
            })();
            ctx?.waitUntil(pump);
            if (!ctx)
                pump.catch(() =>
                    console.error("Floret sandbox cleanup failed"),
                );
            return new Response(readable, {
                headers: { ...CORS, "Content-Type": "text/event-stream" },
            });
        },
    };
}
