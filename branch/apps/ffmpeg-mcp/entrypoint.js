import { getContainer } from "@cloudflare/containers";
import { FfmpegContainer } from "./container.js";
import { createWorker } from "./worker.js";

export { FfmpegContainer };

export default createWorker({
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    getContainerImpl: getContainer,
    createFixedLengthStreamImpl: (length) => new FixedLengthStream(length),
});
