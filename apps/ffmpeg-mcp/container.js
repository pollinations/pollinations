import { Container } from "@cloudflare/containers";
import { runFfmpeg, runFfprobe } from "./container-runtime.js";

export class FfmpegContainer extends Container {
    enableInternet = false;

    async run(inputs, args, outputExtension, deadlineMs) {
        const runtime = this.ctx.container;
        if (!runtime.running) {
            await this.start({ enableInternet: false });
        }

        return runFfmpeg(
            runtime,
            (promise) => this.ctx.waitUntil(promise),
            inputs,
            args,
            outputExtension,
            deadlineMs,
        );
    }

    async probe(input, deadlineMs) {
        const runtime = this.ctx.container;
        if (!runtime.running) {
            await this.start({ enableInternet: false });
        }

        return runFfprobe(runtime, input, deadlineMs);
    }
}
