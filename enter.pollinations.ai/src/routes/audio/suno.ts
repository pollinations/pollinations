import type { Logger } from "@logtape/logtape";
import {
    buildUsageHeaders,
    createCompletionAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    getDefaultErrorMessage,
    remapUpstreamStatus,
    UpstreamError,
} from "@/error.ts";
import { parseMp4Duration } from "./mp4-duration.ts";

export async function generateSunoMusic(opts: {
    prompt: string;
    apiKey: string;
    log: Logger;
}): Promise<Response> {
    const { prompt, apiKey, log } = opts;

    if (!apiKey) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Suno music service is not configured (missing API key)",
        });
    }

    if (prompt.length > 10000) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: `Prompt too long: ${prompt.length} characters. Maximum is 10000.`,
        });
    }

    const models = ["suno-v5", "suno-v4.5"];

    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const isLastModel = i === models.length - 1;

        try {
            log.info("Suno request: model={model}, chars={chars}", {
                model,
                chars: prompt.length,
            });

            const response = await fetch(
                "https://api.airforce/v1/images/generations",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        prompt,
                        n: 1,
                        sse: true,
                        response_format: "url",
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                log.warn("Suno {model} error {status}: {body}", {
                    model,
                    status: response.status,
                    body: errorText,
                });
                if (!isLastModel) continue;
                throw new UpstreamError(remapUpstreamStatus(response.status), {
                    message:
                        errorText || getDefaultErrorMessage(response.status),
                });
            }

            const text = await response.text();
            let resultUrl: string | undefined;

            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (
                    !trimmed.startsWith("data: ") ||
                    trimmed === "data: [DONE]" ||
                    trimmed === "data: : keepalive"
                ) {
                    continue;
                }
                try {
                    const parsed = JSON.parse(trimmed.slice(6)) as {
                        data?: Array<{ url?: string }>;
                        error?: string;
                    };
                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                    const url = parsed.data?.[0]?.url;
                    if (url) resultUrl = url;
                } catch (e) {
                    if (e instanceof UpstreamError) throw e;
                    log.debug("Skipping SSE line: {line}", { line: trimmed });
                }
            }

            if (!resultUrl) {
                log.warn("Suno {model} SSE returned no URL", { model });
                if (!isLastModel) continue;
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message: "Suno returned no result URL",
                });
            }

            log.info("Downloading Suno result from {url}", { url: resultUrl });
            const downloadResponse = await fetch(resultUrl);
            if (!downloadResponse.ok) {
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message: `Failed to download Suno result: ${downloadResponse.status}`,
                });
            }

            const audioBuffer = await downloadResponse.arrayBuffer();
            const estimatedDuration =
                parseMp4Duration(audioBuffer) ?? audioBuffer.byteLength / 46000;

            const usageHeaders = buildUsageHeaders(
                "suno",
                createCompletionAudioSecondsUsage(estimatedDuration),
            );

            log.info(
                "Suno success: model={model}, {bytes} bytes, ~{duration}s",
                {
                    model,
                    bytes: audioBuffer.byteLength,
                    duration: Math.round(estimatedDuration),
                },
            );

            return new Response(audioBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "audio/mpeg",
                    ...usageHeaders,
                },
            });
        } catch (e) {
            if (e instanceof UpstreamError) throw e;
            log.warn("Suno {model} failed: {error}", {
                model,
                error: (e as Error).message,
            });
            if (isLastModel) {
                throw new UpstreamError(500 as ContentfulStatusCode, {
                    message: `Suno music generation failed: ${(e as Error).message}`,
                });
            }
        }
    }

    throw new UpstreamError(500 as ContentfulStatusCode, {
        message: "Suno music generation failed",
    });
}
