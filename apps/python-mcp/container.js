import { Container } from "@cloudflare/containers";

const MAX_OUTPUT_LENGTH = 64_000;

async function decodeStream(stream) {
    if (!stream) return "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(
            -MAX_OUTPUT_LENGTH,
        );
    }
    return (text + decoder.decode()).slice(-MAX_OUTPUT_LENGTH);
}

export class PythonContainer extends Container {
    enableInternet = false;

    async run(code, deadlineMs) {
        const runtime = this.ctx.container;
        if (!runtime.running) await this.start({ enableInternet: false });
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) {
            return { exitCode: 124, stdout: "", stderr: "Startup timed out" };
        }

        const process = await runtime.exec(["python3", "-I", "-c", code]);
        const timer = setTimeout(() => process.kill(9), remainingMs);
        const [exitCode, stdout, stderr] = await Promise.all([
            process.exitCode,
            decodeStream(process.stdout),
            decodeStream(process.stderr),
        ]).finally(() => clearTimeout(timer));
        return { exitCode, stdout, stderr };
    }
}
