import { getLogger, type Logger, withContext } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { ensureConfigured } from "@/logger";

export type LoggerVariables = {
    log: Logger;
    requestStartedAt: number;
};

type Env = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables;
};

export const logger = createMiddleware<Env>(async (c, next) => {
    await ensureConfigured({
        level: c.env.LOG_LEVEL || "debug",
        format: c.env.LOG_FORMAT || "text",
    });
    const log = getLogger(["hono"]);
    c.set("log", log);

    const startTime = Date.now();
    c.set("requestStartedAt", startTime);
    const shouldEmitRequestLogs = (
        ["local", "test"] as readonly string[]
    ).includes(c.env.ENVIRONMENT);

    await withContext(
        {
            requestId: c.var.requestId,
            method: c.req.method,
            routePath: c.req.url,
            userAgent: c.req.header("user-agent"),
            ipAddress:
                c.req.header("cf-connecting-ip") ||
                c.req.header("x-forwarded-for"),
        },
        async () => {
            if (shouldEmitRequestLogs) {
                log.info("{method} {url}", {
                    method: c.req.method,
                    url: c.req.url,
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
