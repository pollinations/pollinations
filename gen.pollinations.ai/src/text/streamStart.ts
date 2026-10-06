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

/** Catch startup errors for at most two seconds, then replay accepted bytes unchanged. */
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
        const error = (details as { error?: StreamError })?.error;
        const status =
            error?.type === "invalid_request_error" ||
            error?.code === "context_length_exceeded" ||
            error?.code === "invalid_prompt"
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
                // Compatible providers use non-JSON data as keepalives.
                return;
            }
            if (!value || typeof value !== "object") return;
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
    let pendingRead: ReturnType<typeof reader.read> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 2000);
    });
    try {
        while (!accepted) {
            pendingRead = reader.read();
            const result = await Promise.race([pendingRead, timeout]);
            if (!result) break;
            pendingRead = undefined;
            const { done, value } = result;
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
    } finally {
        clearTimeout(timer);
    }
    return new ReadableStream({
        start(controller) {
            for (const chunk of prefix) controller.enqueue(chunk);
        },
        async pull(controller) {
            try {
                // A timeout hands off the existing pending read too; starting
                // another read here would drop the first post-timeout chunk.
                const read = pendingRead ?? reader.read();
                pendingRead = undefined;
                const { done, value } = await read;
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
