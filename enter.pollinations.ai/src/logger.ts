import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";
import { applyColor } from "@/util";
import {
    configure,
    getConsoleSink,
    getAnsiColorFormatter,
    FormattedValues,
    LogLevel,
} from "@logtape/logtape";

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
    return [vs.level, shortRequestId, vs.category, vs.message]
        .filter((v) => !!v)
        .join(" ");
}

let configured = false;

export async function ensureConfigured(logLevel: LogLevel) {
    if (configured) return;
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
                category: ["durable"],
                sinks: ["console"],
                lowestLevel: logLevel,
            },
            {
                category: ["test"],
                sinks: ["console"],
                lowestLevel: logLevel,
            },
        ],
        contextLocalStorage: new AsyncLocalStorage(),
        reset: true,
    });
    configured = true;
}
