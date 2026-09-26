import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    createAudioSecondsUsage,
} from "@shared/registry/usage-headers.ts";
import { unzipSync } from "fflate";
import type { Context } from "hono";
import { parseBuffer } from "music-metadata";
import type { Env } from "../env.ts";

export const STEM_VARIATIONS = ["two_stems_v1", "six_stems_v1"] as const;
export type StemVariation = (typeof STEM_VARIATIONS)[number];

// MP3 metadata duration includes encoder delay and padding. ElevenLabs meters
// decoded samples instead. Read the gapless Xing/LAME extension when present.
function mp3DecodedSeconds(
    bytes: Uint8Array,
    sampleRate: number,
): number | undefined {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let start = 0;
    if (
        bytes.length >= 10 &&
        new TextDecoder().decode(bytes.subarray(0, 3)) === "ID3"
    ) {
        start =
            10 +
            ((bytes[6] & 127) << 21) +
            ((bytes[7] & 127) << 14) +
            ((bytes[8] & 127) << 7) +
            (bytes[9] & 127);
        if (bytes[5] & 16) start += 10;
    }
    for (
        let frame = start;
        frame < Math.min(start + 4096, bytes.length - 4);
        frame++
    ) {
        if (bytes[frame] !== 255 || (bytes[frame + 1] & 224) !== 224) continue;
        const version = (bytes[frame + 1] >> 3) & 3;
        const layer = (bytes[frame + 1] >> 1) & 3;
        if (version === 1 || layer !== 1) continue;
        const mono = bytes[frame + 3] >> 6 === 3;
        const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
        const xing = frame + 4 + sideInfo;
        if (xing + 12 > bytes.length) return;
        const tag = new TextDecoder().decode(bytes.subarray(xing, xing + 4));
        if (tag !== "Xing" && tag !== "Info") continue;
        const flags = view.getUint32(xing + 4);
        if (!(flags & 1)) return;
        const frames = view.getUint32(xing + 8);
        const encoder =
            xing +
            8 +
            (flags & 1 ? 4 : 0) +
            (flags & 2 ? 4 : 0) +
            (flags & 4 ? 100 : 0) +
            (flags & 8 ? 4 : 0);
        if (encoder + 24 > bytes.length) return;
        const name = new TextDecoder().decode(
            bytes.subarray(encoder, encoder + 4),
        );
        if (!["LAME", "Lavc", "Lavf"].includes(name)) return;
        const delay = (bytes[encoder + 21] << 4) | (bytes[encoder + 22] >> 4);
        const padding = ((bytes[encoder + 22] & 15) << 8) | bytes[encoder + 23];
        return (
            (frames * (version === 3 ? 1152 : 576) - delay - padding) /
            sampleRate
        );
    }
}

async function audioSeconds(bytes: Uint8Array): Promise<number> {
    const { format } = await parseBuffer(
        bytes,
        { size: bytes.length },
        { duration: true, skipCovers: true },
    );
    const duration =
        format.codec?.includes("Layer 3") && format.sampleRate
            ? (mp3DecodedSeconds(bytes, format.sampleRate) ?? format.duration)
            : format.duration;
    if (
        !duration ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !format.hasAudio ||
        format.hasVideo
    )
        throw new Error("Invalid audio duration");
    return duration;
}

export async function stemInputSeconds(file: File): Promise<number> {
    try {
        return await audioSeconds(new Uint8Array(await file.arrayBuffer()));
    } catch {
        throw new UpstreamError(400, {
            message: "Upload a valid audio file with a readable duration.",
        });
    }
}

export async function stemArchiveSeconds(archive: Uint8Array): Promise<number> {
    try {
        const bytes = unzipSync(archive, {
            filter: (file) =>
                file.name === "vocals.mp3" &&
                file.originalSize <= 50 * 1024 * 1024,
        })["vocals.mp3"];
        if (!bytes) throw new Error("Missing vocal stem");
        return await audioSeconds(bytes);
    } catch {
        throw new UpstreamError(502, {
            message:
                "Stem separation returned an archive without a valid audio duration.",
        });
    }
}

export async function handleStemSeparation(c: Context<Env>): Promise<Response> {
    const form = c.get("formData");
    const file = form?.get("file");
    if (!(file instanceof File)) {
        throw new UpstreamError(400, { message: "Missing required file." });
    }
    if (file.size > 50 * 1024 * 1024) {
        throw new UpstreamError(413, {
            message: "Source audio must be 50 MB or smaller.",
        });
    }
    if (file.size === 0) {
        throw new UpstreamError(400, {
            message: "Source audio must not be empty.",
        });
    }
    const variation = form?.get("stem_variation_id") ?? "six_stems_v1";
    if (!STEM_VARIATIONS.includes(variation as StemVariation)) {
        throw new UpstreamError(400, {
            message: "stem_variation_id must be two_stems_v1 or six_stems_v1.",
        });
    }
    const inputSeconds = await stemInputSeconds(file);
    c.var.track.setPricingInput({ stemVariation: variation as StemVariation });
    if (!c.env.ELEVENLABS_API_KEY) {
        throw new UpstreamError(500, {
            message: "Stem separation is not configured.",
        });
    }
    const body = new FormData();
    body.set("file", file, file.name);
    body.set("stem_variation_id", variation);
    const endpoint =
        "https://api.elevenlabs.io/v1/music/stem-separation?output_format=mp3_44100_128";
    const response = await ensureUpstreamOk(
        await fetch(endpoint, {
            method: "POST",
            headers: {
                "xi-api-key": c.env.ELEVENLABS_API_KEY,
                Accept: "application/zip",
            },
            body,
        }),
        endpoint,
    );
    if (!response.headers.get("content-type")?.startsWith("application/zip")) {
        await response.body?.cancel();
        throw new UpstreamError(502, {
            message: "Stem separation returned an invalid archive response.",
        });
    }
    // No usage headers are returned. Bill decoded input duration, reconciled
    // with workspace analytics. Cross-check against the trusted returned stem:
    // upstream MP3s omit gapless tags and include up to three frames of padding.
    const archive = new Uint8Array(await response.arrayBuffer());
    const outputSeconds = await stemArchiveSeconds(archive);
    if (Math.abs(outputSeconds - inputSeconds) > (3 * 1152) / 44100) {
        throw new UpstreamError(400, {
            message:
                "Source audio duration metadata does not match the separated audio.",
        });
    }
    return new Response(archive, {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="stems.zip"',
            ...buildUsageHeaders(
                c.var.model.resolved,
                createAudioSecondsUsage(inputSeconds),
            ),
        },
    });
}
