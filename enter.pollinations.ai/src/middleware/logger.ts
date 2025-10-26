import {
    configure,
    getConsoleSink,
    getLogger,
    Logger,
    withContext,
    getAnsiColorFormatter,
    FormattedValues,
} from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";
import { applyColor } from "@/util";

export type LoggerVariables = {
    log: Logger;
};

type Env = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables;
};

function formatValue(v: unknown): string {
    if (typeof v === "string") return v;
    else return inspect(v, { colors: true, compact: false });
}

function formatLogline(vs: FormattedValues): string {
    const requestId = vs.record.properties["requestId"];
    const shortRequestId =
        typeof requestId === "string"
            ? applyColor("cyan", `[${requestId.slice(0, 8)}]`)
            : undefined;
    return [vs.timestamp, vs.level, shortRequestId, vs.message]
        .filter((v) => !!v)
        .join(" ");
}

let configured = false;

async function ensureConfigured(env: CloudflareBindings) {
    if (configured) return;
    const logLevel = env.LOG_LEVEL || "info";
    await configure({
        sinks: {
            console: getConsoleSink({
                formatter: getAnsiColorFormatter({
                    level: "FULL",
                    value: formatValue,
                    format: formatLogline,
                }),
            }),
        },
        loggers: [
            {
                category: ["logtape", "meta"],
                sinks: ["console"],
                lowestLevel: "warning",
            },
            {
                category: ["hono"],
                sinks: ["console"],
                lowestLevel: logLevel,
            },
            {
                category: ["test", "mock"],
                sinks: ["console"],
                lowestLevel: logLevel,
            },
        ],
        contextLocalStorage: new AsyncLocalStorage(),
        reset: true,
    });
}

export const logger = createMiddleware<Env>(async (c, next) => {
    await ensureConfigured(c.env);
    const log = getLogger(["hono"]);
    c.set("log", log);

    const requestId = c.var.requestId;
    const startTime = Date.now();

    await withContext(
        {
            requestId: c.var.requestId,
            method: c.req.method,
            url: c.req.url,
            userAgent: c.req.header("user-agent"),
            ipAddress:
                c.req.header("cf-connecting-ip") ||
                c.req.header("x-forwarded-for"),
        },
        async () => {
            log.info("{method} {url}", {
                method: c.req.method,
                url: c.req.url,
                requestId,
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
