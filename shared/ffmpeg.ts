export const FFMPEG_MODEL = "ffmpeg";
export const FFMPEG_MAX_RUN_MS = 110_000;
export const FFMPEG_MAX_MEDIA_BYTES = 100 * 1024 * 1024;

// Cloudflare basic Container: 1/4 vCPU, 1 GiB memory, 4 GB disk.
// CPU is charged by active CPU time; using the full allocation makes this a
// simple published-rate ceiling per active wall-clock second.
export const FFMPEG_COST_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;

export const FFMPEG_OUTPUT_EXTENSIONS = [
    "mp4",
    "webm",
    "mov",
    "mp3",
    "m4a",
    "wav",
    "flac",
    "ogg",
    "gif",
    "jpg",
    "jpeg",
    "png",
] as const;

export type FfmpegOutputExtension = (typeof FFMPEG_OUTPUT_EXTENSIONS)[number];

export function calculateFfmpegCharge(runtimeMs: number): number {
    const billableMs = Math.max(0, Number.isFinite(runtimeMs) ? runtimeMs : 0);
    return (billableMs / 1000) * FFMPEG_COST_PER_SECOND;
}
