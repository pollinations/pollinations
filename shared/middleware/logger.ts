import {
    getLogger,
    type Logger,
    type LogLevel,
    withContext,
} from "@logtape/logtape";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getRealClientIp } from "../client-ip.ts";
import { redactCredentialQueryParams } from "../http/redaction.ts";
import { ensureConfigured } from "../logger.ts";
import { getPublicUrl } from "../public-origin.ts";

export type LoggerVariables = {
    log: Logger;
    requestStartedAt: number;
};

type LoggerEnv = {
    Bindings: {
        ENVIRONMENT?: string;
        LOG_FORMAT?: "json" | "text";
        LOG_LEVEL?: LogLevel;
    };
    Variables: LoggerVariables & { requestId?: string };
};

type LoggerOptions = {
    redactCredentialQueryParams?: boolean;
};

function publicUrlString(c: Context<LoggerEnv>, options: LoggerOptions): string {
    const publicUrl = getPublicUrl(c);
    return options.redactCredentialQueryParams !== false
        ? redactCredentialQueryParams(publicUrl)
        : publicUrl.toString();
}

export function createLoggerMiddleware(options: LoggerOptions = {}) {
    return createMiddleware<LoggerEnv>(async (c, next) => {
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

        const publicUrl = publicUrlString(c, options);

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

export const logger = createLoggerMiddleware();
