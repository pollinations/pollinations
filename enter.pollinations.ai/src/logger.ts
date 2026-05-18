import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";
import {
    configure,
    type FormattedValues,
    getAnsiColorFormatter,
    getConsoleSink,
    getJsonLinesFormatter,
    type LogLevel,
} from "@logtape/logtape";
import { applyColor } from "@/util";

export type LogFormat = "json" | "text";

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

const jsonLinesFormatter = () =>
    getJsonLinesFormatter({
        properties: "nest:properties",
        categorySeparator: ":",
    });

export const ansiColorFormatter = () =>
    getAnsiColorFormatter({
        level: "FULL",
        value: formatValue,
        format: formatLogline,
    });

export async function ensureConfigured(options: {
    level: LogLevel;
    format?: LogFormat;
}) {
    if (configured) return;
    await configure({
        sinks: {
            console: getConsoleSink({
                formatter:
                    options.format === "json"
                        ? jsonLinesFormatter()
                        : ansiColorFormatter(),
            }),
        },
        loggers: [
            {
                category: ["logtape", "meta"],
                sinks: ["console"],
                lowestLevel: "warning",
            },
            {
                category: [], // catches all categories
                sinks: ["console"],
                lowestLevel: options.level,
            },
        ],
        contextLocalStorage: new AsyncLocalStorage(),
        reset: true,
    });
    configured = true;
}
