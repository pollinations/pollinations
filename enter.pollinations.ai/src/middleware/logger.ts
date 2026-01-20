import { getLogger, Logger, withContext } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { ensureConfigured } from "@/logger";

export type LoggerVariables = {
    log: Logger;
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
            log.info("{method} {url}", {
                method: c.req.method,
                url: c.req.url,
            });

            await next();

            const duration = Date.now() - startTime;
            log.info("RESPONSE {status} {duration}ms", {
                status: c.res.status,
                duration,
            });
        },
    );
});
