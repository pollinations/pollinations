import { getLogger } from "@logtape/logtape";

function rejectionHandler(reason: any) {
    const log = getLogger(["test", "rejection"]);
    if (reason?.statusCode === 302) {
        log.warn("Caught expected 302 redirect during OAuth flow");
        return;
    }
    throw reason;
}

process.on("unhandledRejection", rejectionHandler);
