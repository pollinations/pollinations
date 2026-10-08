import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import { z } from "zod";
import { arrayBufferToBase64 } from "@/util.ts";
import {
    assertTranscriptionResponseFormat,
    buildTranscriptionResponse,
} from "../routes/transcription-response.ts";

const azureTranscript = z.object({
    durationMilliseconds: z.number().positive(),
    combinedPhrases: z.array(z.object({ text: z.string() })),
    phrases: z
        .array(
            z.object({
                text: z.string(),
                offsetMilliseconds: z.number(),
                durationMilliseconds: z.number(),
                locale: z.string().optional(),
            }),
        )
        .optional(),
});
const gatewayTranscript = z.object({
    text: z.string(),
    durationInSeconds: z.number().positive(),
    language: z.string().nullish(),
    segments: z
        .array(
            z.object({
                text: z.string(),
                startSecond: z.number(),
                endSecond: z.number(),
            }),
        )
        .optional(),
});

export async function transcribeMai(opts: {
    file: File;
    modelId: string;
    apiKey: string;
    language?: string | null;
    prompt?: string | null;
    responseFormat?: string | null;
    temperature?: number;
}): Promise<Response> {
    const { file, modelId, apiKey, responseFormat } = opts;
    assertTranscriptionResponseFormat(responseFormat, modelId, [
        "json",
        "text",
        "verbose_json",
    ]);
    // Both routes must implement the same initial public contract.
    if (
        opts.language ||
        opts.prompt ||
        (opts.temperature !== undefined && opts.temperature !== 0)
    )
        throw new UpstreamError(400, {
            message:
                "MAI transcription currently uses automatic language detection and does not support prompt or temperature controls.",
        });
    if (!apiKey)
        throw new UpstreamError(500, {
            message: "MAI transcription provider is not configured.",
        });
    const gateway = modelId.endsWith(":vercel");
    const url = gateway
        ? "https://ai-gateway.vercel.sh/v4/ai/transcription-model"
        : "https://myceli-prod-swedencentral.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15";
    const form = new FormData();
    form.append("audio", file, file.name || "audio.wav");
    form.append(
        "definition",
        JSON.stringify({
            enhancedMode: { enabled: true, model: "MAI-Transcribe-2" },
        }),
    );
    const response = await ensureUpstreamOk(
        await fetch(url, {
            method: "POST",
            headers: gateway
                ? {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                      "ai-gateway-protocol-version": "0.0.1",
                      "ai-transcription-model-specification-version": "4",
                      "ai-model-id": "microsoft/mai-transcribe-2",
                  }
                : { "Ocp-Apim-Subscription-Key": apiKey },
            body: gateway
                ? JSON.stringify({
                      audio: arrayBufferToBase64(await file.arrayBuffer()),
                      mediaType: file.type || "audio/wav",
                  })
                : form,
        }),
        url,
    );
    const body = await response.json();
    const parsed = gateway
        ? gatewayTranscript.safeParse(body)
        : azureTranscript.safeParse(body);
    if (!parsed.success)
        throw new UpstreamError(502, {
            message:
                "MAI transcription returned invalid text or duration metering.",
        });
    const normalized = gateway
        ? (() => {
              const data = gatewayTranscript.parse(body);
              return {
                  text: data.text,
                  duration: data.durationInSeconds,
                  language: data.language || undefined,
                  words: [],
                  segments: (data.segments ?? []).map((p) => ({
                      text: p.text,
                      start: p.startSecond,
                      end: p.endSecond,
                  })),
                  diarizedSegments: [],
              };
          })()
        : (() => {
              const data = azureTranscript.parse(body);
              return {
                  text: data.combinedPhrases.map((p) => p.text).join("\n"),
                  duration: data.durationMilliseconds / 1000,
                  language: data.phrases?.[0]?.locale,
                  words: [],
                  segments: (data.phrases ?? []).map((p) => ({
                      text: p.text,
                      start: p.offsetMilliseconds / 1000,
                      end:
                          (p.offsetMilliseconds + p.durationMilliseconds) /
                          1000,
                  })),
                  diarizedSegments: [],
              };
          })();
    return buildTranscriptionResponse({
        normalized,
        responseFormat: responseFormat || "json",
        usageHeaders: buildUsageHeaders(
            modelId,
            createAudioSecondsUsage(normalized.duration),
        ),
    });
}
