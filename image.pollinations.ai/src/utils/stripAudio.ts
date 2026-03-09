import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import debug from "debug";

const log = debug("pollinations:video:strip-audio");

/**
 * Strip the audio track from an MP4 video buffer using ffmpeg.
 * Returns the video-only buffer, or the original buffer if ffmpeg is unavailable.
 */
export async function stripAudioFromMp4(buffer: Buffer): Promise<Buffer> {
    const tempDir = await mkdtemp(join(tmpdir(), "strip-audio-"));
    const inputPath = join(tempDir, "input.mp4");
    const outputPath = join(tempDir, "output.mp4");

    try {
        await writeFile(inputPath, buffer);

        await new Promise<void>((resolve, reject) => {
            execFile(
                "ffmpeg",
                ["-i", inputPath, "-c:v", "copy", "-an", outputPath],
                { timeout: 30_000 },
                (error) => {
                    if (error) reject(error);
                    else resolve();
                },
            );
        });

        const result = await readFile(outputPath);
        log(`Stripped audio: ${buffer.length} bytes -> ${result.length} bytes`);
        return result;
    } catch (error) {
        log("Failed to strip audio, returning original buffer:", error);
        return buffer;
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
