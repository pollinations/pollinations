import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import {
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
    ROBOTIC_ROBOT_RUN_JS_PRICE_PER_MB_SECOND,
    ROBOTIC_ROBOT_TIME_PRICE_PER_REQUEST,
} from "../../shared/registry/mcp.ts";

const UPSTREAM_URL = "https://mcp.roboticrobot.xyz/mcp/pollinations";
const TIME_ADJUSTMENT_ID = "robotic_robot.time.v1";
const RUN_JS_ADJUSTMENT_IDS = {
    0.01: "robotic_robot.run_js.0_01_vcpu.v1",
    0.025: "robotic_robot.run_js.0_025_vcpu.v1",
};
const RUN_JS_RAM_MB = new Set([4, 8, 16]);
const RUN_JS_MAX_DURATION_MS = 15_000;
const TOOLS_BY_PATH = {
    "/run-js": "run-js",
    "/time": "time",
};

function parseMcpPayload(body, contentType) {
    const text = new TextDecoder().decode(body);
    if (!contentType.includes("text/event-stream")) {
        return JSON.parse(text);
    }
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload?.result !== undefined || payload?.error !== undefined) {
            return payload;
        }
    }
    return undefined;
}

function parseRunJsResult(payload) {
    for (const block of payload?.result?.content ?? []) {
        if (block?.type !== "text") continue;
        try {
            const result = JSON.parse(block.text);
            if (result && typeof result === "object") return result;
        } catch {
            // Other text content is not the structured run-js receipt.
        }
    }
    return undefined;
}

function filterToolList(body, contentType, tool) {
    const filterPayload = (payload) => {
        if (Array.isArray(payload?.result?.tools)) {
            payload.result.tools = payload.result.tools.filter(
                ({ name }) => name === tool,
            );
        }
        return payload;
    };
    const text = new TextDecoder().decode(body);
    if (!contentType.includes("text/event-stream")) {
        return new TextEncoder().encode(
            JSON.stringify(filterPayload(JSON.parse(text))),
        );
    }
    return new TextEncoder().encode(
        text
            .split(/(\r?\n)/)
            .map((line) => {
                if (!line.startsWith("data:")) return line;
                const payload = JSON.parse(line.slice(5).trim());
                return `data: ${JSON.stringify(filterPayload(payload))}`;
            })
            .join(""),
    );
}

function usageForTool(requestPayload, responsePayload) {
    if (requestPayload?.method !== "tools/call") return undefined;
    const tool = requestPayload.params?.name;
    if (tool === "time") {
        const failed = Boolean(
            responsePayload?.error || responsePayload?.result?.isError,
        );
        return {
            cost: failed ? 0 : ROBOTIC_ROBOT_TIME_PRICE_PER_REQUEST,
            tool,
            status: failed ? 422 : 200,
            adjustmentId: TIME_ADJUSTMENT_ID,
            adjustmentUnits: failed ? 0 : 1,
            error: failed ? "Time request failed" : undefined,
        };
    }
    if (tool !== "run-js") return undefined;

    const result = parseRunJsResult(responsePayload);
    const durationMs = Number(result?.durationMs);
    const ramMb = Number(result?.sku?.ramMb);
    const cpu = Number(result?.sku?.cpu);
    const pricePerMbSecond = ROBOTIC_ROBOT_RUN_JS_PRICE_PER_MB_SECOND[cpu];
    const adjustmentId = RUN_JS_ADJUSTMENT_IDS[cpu];
    if (
        !Number.isFinite(durationMs) ||
        durationMs < 0 ||
        durationMs > RUN_JS_MAX_DURATION_MS ||
        !RUN_JS_RAM_MB.has(ramMb) ||
        pricePerMbSecond === undefined ||
        adjustmentId === undefined
    ) {
        return responsePayload?.error || responsePayload?.result?.isError
            ? {
                  cost: 0,
                  tool,
                  status: 422,
                  adjustmentId: RUN_JS_ADJUSTMENT_IDS[0.01],
                  adjustmentUnits: 0,
                  error: result?.error ?? "JavaScript request failed",
              }
            : undefined;
    }

    const units = ramMb * (durationMs / 1000);
    const failed = Boolean(
        responsePayload?.result?.isError || result?.ok === false,
    );
    return {
        cost: units * pricePerMbSecond,
        tool,
        status: failed ? 422 : 200,
        adjustmentId,
        adjustmentUnits: units,
        error: failed
            ? (result?.error ?? "JavaScript execution failed")
            : undefined,
    };
}

function sanitizedHeaders(headers) {
    const result = new Headers(headers);
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        result.delete(header);
    }
    result.delete("content-length");
    return result;
}

function billingError(requestPayload) {
    return Response.json(
        {
            jsonrpc: "2.0",
            id: requestPayload?.id ?? null,
            error: {
                code: -32603,
                message: "Upstream MCP response is missing runtime usage",
            },
        },
        { status: 502 },
    );
}

export function createWorker({ fetchImpl }) {
    return {
        async fetch(request) {
            const allowedTool = TOOLS_BY_PATH[new URL(request.url).pathname];
            if (!allowedTool) {
                return new Response("Not found", { status: 404 });
            }
            const requestPayload = await request
                .clone()
                .json()
                .catch(() => null);
            if (Array.isArray(requestPayload)) {
                return Response.json(
                    {
                        error: "invalid_request",
                        message: "Batch requests are not supported.",
                    },
                    { status: 400 },
                );
            }
            if (
                requestPayload?.method === "tools/call" &&
                requestPayload.params?.name !== allowedTool
            ) {
                return Response.json({
                    jsonrpc: "2.0",
                    id: requestPayload.id ?? null,
                    error: { code: -32601, message: "Tool not found" },
                });
            }

            const headers = new Headers(request.headers);
            headers.delete("authorization");
            headers.delete("cookie");
            headers.delete(MCP_USER_ID_HEADER);
            for (const header of Object.values(MCP_USAGE_HEADERS)) {
                headers.delete(header);
            }
            const upstream = await fetchImpl(UPSTREAM_URL, {
                method: request.method,
                headers,
                body:
                    request.method === "GET" || request.method === "HEAD"
                        ? undefined
                        : request.body,
                redirect: "manual",
            });
            let body = await upstream.arrayBuffer();
            const contentType = upstream.headers.get("content-type") ?? "";
            if (upstream.ok && requestPayload?.method === "tools/list") {
                try {
                    body = filterToolList(body, contentType, allowedTool);
                } catch {
                    return billingError(requestPayload);
                }
            }
            const response = new Response(body, {
                status: upstream.status,
                statusText: upstream.statusText,
                headers: sanitizedHeaders(upstream.headers),
            });
            if (!upstream.ok || requestPayload?.method !== "tools/call") {
                return response;
            }

            let responsePayload;
            try {
                responsePayload = parseMcpPayload(body, contentType);
            } catch {
                return billingError(requestPayload);
            }
            const usage = usageForTool(requestPayload, responsePayload);
            if (
                (requestPayload.params?.name === "time" ||
                    requestPayload.params?.name === "run-js") &&
                !usage
            ) {
                return billingError(requestPayload);
            }
            return withMcpUsageHeaders(response, usage);
        },
    };
}
