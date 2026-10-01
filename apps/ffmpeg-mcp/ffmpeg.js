import { FFMPEG_MCP_PRICE_PER_SECOND } from "../../shared/registry/mcp.ts";

export const FFMPEG_MAX_RUN_MS = 110_000;
export const FFMPEG_MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export const FFMPEG_COST_PER_SECOND = FFMPEG_MCP_PRICE_PER_SECOND;

export function calculateFfmpegCharge(runtimeMs) {
    return (Math.max(0, runtimeMs) / 1000) * FFMPEG_COST_PER_SECOND;
}
