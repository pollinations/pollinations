import { getLogger } from "@logtape/logtape";

// biome-ignore lint/suspicious/noExplicitAny: rejection handler receives unknown errors
function rejectionHandler(reason: any) {
    const log = getLogger(["test", "rejection"]);
    if (reason?.statusCode === 302) {
        log.warn("Caught expected 302 redirect during OAuth flow");
        return;
    }
    throw reason;
}

process.on("unhandledRejection", rejectionHandler);
