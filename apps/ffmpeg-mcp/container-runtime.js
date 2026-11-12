import { FFMPEG_MAX_MEDIA_BYTES } from "./ffmpeg.js";

const WORK_DIR = "/work";
const MAX_ERROR_LENGTH = 8_000;
const MAX_PROBE_OUTPUT_LENGTH = 64_000;

async function decodeStream(stream, maxLength = MAX_ERROR_LENGTH) {
    if (!stream) return "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(
            -maxLength,
        );
    }
    return (text + decoder.decode()).slice(-maxLength);
}

// Saves the sources as input0, input1, and so on; returns the error if one fails.
async function saveInputs(runtime, inputs) {
    for (const [index, input] of inputs.entries()) {
        const write = await runtime.exec(["tee", `${WORK_DIR}/input${index}`], {
            stdin: input,
            stdout: "ignore",
        });
        const [writeExitCode, writeError] = await Promise.all([
            write.exitCode,
            decodeStream(write.stderr),
        ]);
        if (writeExitCode !== 0) {
            return writeError || "FFmpeg input could not be saved";
        }
    }
}

export async function runFfmpeg(
    runtime,
    waitUntil,
    inputs,
    args,
    outputExtension,
    deadlineMs,
) {
    const saveError = await saveInputs(runtime, inputs);
    if (saveError) return { ok: false, stderr: saveError };

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
            ...args,
            outputPath,
        ],
        { cwd: WORK_DIR, stdout: "ignore" },
    );
    const timer = setTimeout(() => process.kill(9), remainingMs);
    const [exitCode, stderr] = await Promise.all([
        process.exitCode,
        decodeStream(process.stderr),
    ]).finally(() => clearTimeout(timer));
    if (exitCode !== 0) return { ok: false, stderr };

    const sizeProcess = await runtime.exec(["stat", "-c", "%s", outputPath]);
    const sizeOutput = await sizeProcess.output();
    const bytes = Number(new TextDecoder().decode(sizeOutput.stdout).trim());
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
    waitUntil(read.stdout.pipeTo(output.writable));
    return { ok: true, output: output.readable, bytes, stderr };
}

export async function runFfprobe(runtime, input, deadlineMs) {
    const saveError = await saveInputs(runtime, [input]);
    if (saveError) return { ok: false, stderr: saveError };

    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
        return { ok: false, stderr: "ffprobe startup exceeded its deadline" };
    }

    const process = await runtime.exec(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            `${WORK_DIR}/input0`,
        ],
        { cwd: WORK_DIR },
    );
    const timer = setTimeout(() => process.kill(9), remainingMs);
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exitCode,
        decodeStream(process.stdout, MAX_PROBE_OUTPUT_LENGTH),
        decodeStream(process.stderr),
    ]).finally(() => clearTimeout(timer));
    if (exitCode !== 0) {
        return { ok: false, stderr: stderr || "ffprobe failed" };
    }

    let info;
    try {
        info = JSON.parse(stdout);
    } catch {
        return {
            ok: false,
            stderr: "ffprobe returned output that was not valid JSON",
        };
    }
    return { ok: true, info, stderr };
}
