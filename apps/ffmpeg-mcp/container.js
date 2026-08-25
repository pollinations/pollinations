import { Container } from "@cloudflare/containers";
import { FFMPEG_MAX_MEDIA_BYTES } from "./ffmpeg.js";

const WORK_DIR = "/work";
const MAX_ERROR_LENGTH = 8_000;

async function decodeStream(stream) {
    if (!stream) return "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(
            -MAX_ERROR_LENGTH,
        );
    }
    return (text + decoder.decode()).slice(-MAX_ERROR_LENGTH);
}

export class FfmpegContainer extends Container {
    enableInternet = false;

    async run(input, args, outputExtension, deadlineMs) {
        const runtime = this.ctx.container;
        if (!runtime.running) {
            await this.start({ enableInternet: false });
        }
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) {
            return {
                ok: false,
                stderr: "FFmpeg startup exceeded its deadline",
            };
        }

        const outputPath = `${WORK_DIR}/output.${outputExtension}`;
        const process = await runtime.exec(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-y",
                "-i",
                "pipe:0",
                ...args,
                outputPath,
            ],
            { stdin: input, stdout: "ignore" },
        );
        const timer = setTimeout(() => process.kill(9), remainingMs);
        const [exitCode, stderr] = await Promise.all([
            process.exitCode,
            decodeStream(process.stderr),
        ]).finally(() => clearTimeout(timer));
        if (exitCode !== 0) return { ok: false, stderr };

        const sizeProcess = await runtime.exec([
            "stat",
            "-c",
            "%s",
            outputPath,
        ]);
        const sizeOutput = await sizeProcess.output();
        const bytes = Number(
            new TextDecoder().decode(sizeOutput.stdout).trim(),
        );
        if (sizeOutput.exitCode !== 0 || !Number.isFinite(bytes)) {
            return { ok: false, stderr: "FFmpeg produced no output file" };
        }
        if (bytes > FFMPEG_MAX_MEDIA_BYTES) {
            return { ok: false, stderr: "FFmpeg output exceeds 100 MB" };
        }

        const read = await runtime.exec(["cat", outputPath]);
        if (!read.stdout) {
            return { ok: false, stderr: "FFmpeg output could not be read" };
        }
        const output = new FixedLengthStream(bytes);
        this.ctx.waitUntil(read.stdout.pipeTo(output.writable));
        return { ok: true, output: output.readable, bytes, stderr };
    }
}
