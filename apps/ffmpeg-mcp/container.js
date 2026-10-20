import { Container } from "@cloudflare/containers";
import { runFfmpeg } from "./container-runtime.js";

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
}
