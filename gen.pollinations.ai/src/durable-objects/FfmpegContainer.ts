import { Container } from "@cloudflare/containers";

const WORK_DIR = "/work";
const MAX_RUN_MS = 120_000;
const MAX_ERROR_LENGTH = 8_000;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

type ExecOutput = {
    stdout: ArrayBuffer;
    stderr: ArrayBuffer;
    exitCode: number;
};

type ExecProcess = {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exitCode: Promise<number>;
    output(): Promise<ExecOutput>;
    kill(signal?: number): void;
};

type ContainerRuntime = {
    running: boolean;
    exec(
        command: string[],
        options?: {
            stdin?: ReadableStream<Uint8Array>;
            stdout?: "ignore" | "pipe";
        },
    ): Promise<ExecProcess>;
};

export type FfmpegResult =
    | {
          ok: true;
          output: ReadableStream<Uint8Array>;
          bytes: number;
          stderr: string;
      }
    | { ok: false; stderr: string };

async function decodeStream(
    stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
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
    sleepAfter = "10s";
    enableInternet = false;

    async run(
        input: ReadableStream<Uint8Array>,
        args: string[],
        outputExtension: string,
    ): Promise<FfmpegResult> {
        const runtime = this.ctx.container as ContainerRuntime | undefined;
        if (!runtime) throw new Error("Container runtime is unavailable");
        if (!runtime.running) {
            await this.start({ enableInternet: false });
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
        const timer = setTimeout(() => process.kill(9), MAX_RUN_MS);
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
        if (bytes > MAX_OUTPUT_BYTES) {
            return { ok: false, stderr: "FFmpeg output exceeds 100 MB" };
        }

        const read = await runtime.exec(["cat", outputPath]);
        if (!read.stdout) {
            return { ok: false, stderr: "FFmpeg output could not be read" };
        }
        return { ok: true, output: read.stdout, bytes, stderr };
    }
}
