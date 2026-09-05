import {
    getLogger,
    type Logger,
    type LogLevel,
    withContext,
} from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { getRealClientIp } from "../client-ip.ts";
import { ensureConfigured, type LogFormat } from "../logger.ts";
import { getPublicUrl } from "../public-origin.ts";

export type LoggerVariables = {
    log: Logger;
    requestStartedAt: number;
};

type Env = {
    Bindings: {
        LOG_LEVEL?: LogLevel;
        LOG_FORMAT?: LogFormat;
        ENVIRONMENT?: string;
    };
    Variables: LoggerVariables & { requestId?: string };
};

export function createRequestLogger(formatUrl: (url: URL) => string) {
    return createMiddleware<Env>(async (c, next) => {
        await ensureConfigured({
            level: c.env.LOG_LEVEL || "debug",
            format: c.env.LOG_FORMAT || "text",
        });
        const log = getLogger(["hono"]);
        c.set("log", log);

        const startTime = Date.now();
        c.set("requestStartedAt", startTime);
        const shouldEmitRequestLogs =
            c.env.ENVIRONMENT === "local" || c.env.ENVIRONMENT === "test";

        const publicUrl = formatUrl(getPublicUrl(c));

        await withContext(
            {
                requestId: c.var.requestId,
                method: c.req.method,
                routePath: publicUrl,
                userAgent: c.req.header("user-agent"),
                ipAddress: getRealClientIp(c),
            },
            async () => {
                if (shouldEmitRequestLogs) {
                    log.info("{method} {url}", {
                        method: c.req.method,
                        url: publicUrl,
                    });
                }

                await next();

                const duration = Date.now() - startTime;
                if (shouldEmitRequestLogs) {
                    log.info("RESPONSE {status} {duration}ms", {
                        status: c.res.status,
                        duration,
                    });
                }
            },
        );
    });
}
