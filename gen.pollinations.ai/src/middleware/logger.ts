import { getLogger, type Logger, withContext } from "@logtape/logtape";
import { getRealClientIp } from "@shared/client-ip.ts";
import { getPublicUrl } from "@shared/public-origin.ts";
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

function redactCredentialQueryParams(url: URL): string {
    const redacted = new URL(url);
    for (const param of ["key", "token", "api_key"]) {
        if (redacted.searchParams.has(param)) {
            redacted.searchParams.set(param, "[redacted]");
        }
    }
    return redacted.toString();
}

export const logger = createMiddleware<Env>(async (c, next) => {
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

    const publicUrl = redactCredentialQueryParams(getPublicUrl(c));

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
