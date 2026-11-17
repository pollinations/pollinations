import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioTokenUsage,
} from "@shared/registry/usage-headers.ts";

export async function generateZonosSpeech(
    binding: Fetcher | undefined,
    text: string,
    voice: string,
    format: string,
): Promise<Response> {
    if (voice !== "alloy" || (format !== "mp3" && format !== "pcm")) {
        throw new UpstreamError(400, {
            message:
                "ZONOS3-Mini supports the alloy preset and mp3 or pcm output.",
        });
    }
    if (!binding) {
        throw new UpstreamError(503, {
            message: "ZONOS3-Mini is unavailable.",
        });
    }

    const endpoint = "http://127.0.0.1:1920/speech";
    const response = await ensureUpstreamOk(
        await binding.fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, format }),
        }),
        endpoint,
    );
    const bytes = new TextEncoder().encode(text).byteLength;
    return new Response(response.body, {
        headers: {
            "Content-Type": format === "pcm" ? "audio/pcm" : "audio/mpeg",
            ...buildUsageHeaders(
                "zyphra/zonos3-mini",
                createAudioTokenUsage(bytes),
            ),
            "x-tts-voice": voice,
        },
    });
}
