import { collectUpstreamHeaders, UpstreamError } from "@shared/error.ts";
import { createParser } from "eventsource-parser";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { apiErrorStatus } from "./errors.js";

type StreamError = {
    message?: string;
    type?: string;
    status?: number;
    code?: unknown;
};
type StreamEvent = StreamError & {
    error?: StreamError;
    response?: { error?: StreamError };
    choices?: {
        delta?: Record<string, unknown>;
        finish_reason?: string;
        error?: StreamError;
    }[];
    usage?: unknown;
};

/** Keep startup errors inside the fallback attempt; replay accepted bytes unchanged. */
export async function acceptStreamStart(
    response: Response,
    requestUrl: URL,
    protocol: "chat" | "responses",
): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const reader = response.body?.getReader();
    if (!reader)
        throw new UpstreamError(502, {
            requestUrl,
            message: "Provider returned an empty stream",
        });
    const prefix: Uint8Array<ArrayBuffer>[] = [];
    const decoder = new TextDecoder();
    let accepted = false;
    let bytes = 0;
    const fail = (details: unknown, message: string): never => {
        const error = (
            details as {
                error?: { type?: string; status?: number; code?: unknown };
            }
        )?.error;
        const status =
            error?.type === "invalid_request_error"
                ? 400
                : typeof error?.status === "number"
                  ? error.status
                  : typeof error?.code === "number"
                    ? error.code
                    : 502;
        throw new UpstreamError(
            apiErrorStatus(
                details,
                status >= 400 && status <= 599 ? status : 502,
            ) as ContentfulStatusCode,
            {
                message,
                requestUrl,
                upstreamStatus: response.status,
                upstreamHeaders: collectUpstreamHeaders(response.headers),
                responseBody: JSON.stringify(details),
            },
        );
    };
    const parser = createParser({
        onEvent(event) {
            if (accepted) return;
            if (event.data.trim() === "[DONE]") {
                accepted = true;
                return;
            }
            let value: unknown;
            try {
                value = JSON.parse(event.data);
            } catch {
                fail(
                    { message: "Malformed provider SSE event" },
                    "Malformed provider SSE event",
                );
            }
            if (!value || typeof value !== "object") {
                fail(
                    { message: "Invalid provider SSE event" },
                    "Invalid provider SSE event",
                );
            }
            const data = value as StreamEvent;
            const type = data.type ?? event.event;
            const error =
                data.error ??
                (type === "response.failed"
                    ? data.response?.error
                    : type === "error"
                      ? data
                      : undefined);
            if (error)
                fail(
                    { error },
                    error.message ?? "Provider stream failed before output",
                );
            if (type === "response.failed")
                fail(data, "Provider stream failed before output");
            if (protocol === "responses") {
                // Any output item or hosted-tool activity commits the attempt,
                // including hidden reasoning. Never replay work after this point.
                accepted = ![
                    "response.created",
                    "response.queued",
                    "response.in_progress",
                ].includes(type ?? "");
                return;
            }
            for (const choice of data.choices ?? []) {
                if (
                    Object.entries(choice.delta ?? {}).some(
                        ([key, value]) =>
                            key !== "role" && value !== null && value !== "",
                    )
                ) {
                    accepted = true;
                    return;
                }
                if (
                    choice.finish_reason === "error" ||
                    choice.finish_reason === "content_filter"
                ) {
                    fail(
                        {
                            error: choice.error ?? {
                                message: choice.finish_reason,
                                status:
                                    choice.finish_reason === "content_filter"
                                        ? 422
                                        : 502,
                            },
                        },
                        choice.error?.message ?? choice.finish_reason,
                    );
                }
                if (choice.finish_reason) {
                    accepted = true;
                    return;
                }
            }
            if (data.usage) accepted = true;
        },
    });
    try {
        while (!accepted) {
            const { done, value } = await reader.read();
            if (done) {
                parser.feed(`${decoder.decode()}\n\n`);
                if (!accepted)
                    fail(
                        { message: "Provider stream ended before output" },
                        "Provider stream ended before output",
                    );
                break;
            }
            prefix.push(value);
            bytes += value.byteLength;
            parser.feed(decoder.decode(value, { stream: true }));
            // Bound buffering even for an unrecognized provider protocol. Beyond
            // this point preserve the stream rather than risk replaying work.
            if (bytes >= 65536) accepted = true;
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        throw error;
    }
    return new ReadableStream({
        start(controller) {
            for (const chunk of prefix) controller.enqueue(chunk);
        },
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    reader.releaseLock();
                } else controller.enqueue(value);
            } catch (error) {
                controller.error(error);
                reader.releaseLock();
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                reader.releaseLock();
            }
        },
    });
}
