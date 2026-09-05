import { AsyncLocalStorage } from "node:async_hooks";
import {
    type Config,
    configure,
    getConfig,
    type LogRecord,
} from "@logtape/logtape";
import { ensureConfigured } from "@shared/logger.ts";
import type { LoggerVariables } from "@shared/middleware/logger.ts";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logger as enterLogger } from "../../enter.pollinations.ai/src/middleware/logger.ts";
import { logger as genLogger } from "../src/middleware/logger.ts";

let originalConfig: Config<string, string> | null;
let records: LogRecord[];

beforeAll(async () => {
    await ensureConfigured({ level: "debug" });
    originalConfig = getConfig();
});

beforeEach(async () => {
    records = [];
    await configure({
        sinks: { capture: (record) => records.push(record) },
        loggers: [
            { category: [], sinks: ["capture"], lowestLevel: "debug" },
            { category: ["logtape", "meta"], lowestLevel: "warning" },
        ],
        contextLocalStorage: new AsyncLocalStorage(),
        reset: true,
    });
});

afterAll(async () => {
    if (originalConfig) await configure({ ...originalConfig, reset: true });
});

it("uses the same middleware in both services", () => {
    expect(genLogger).toBe(enterLogger);
});

describe.each([
    ["Gen", genLogger],
    ["Enter", enterLogger],
] as const)("%s request logger", (_name, logger) => {
    it.each([
        "local",
        "test",
        "staging",
        "production",
    ])("preserves raw URLs, context and log ordering in %s", async (environment) => {
        const publicUrl =
            "https://gen.pollinations.ai/log?key=test-value&token=test-token&key=second&text=a%20b";
        const app = new Hono<{
            Variables: LoggerVariables & { requestId: string };
        }>();
        app.use(async (c, next) => {
            c.set("requestId", "test-request");
            await next();
        });
        app.use(logger);
        app.get("/log", (c) => {
            expect(c.var.requestStartedAt).toBeGreaterThan(0);
            c.var.log.info("handler");
            return c.text("ok", 201);
        });
        const response = await app.request(
            "https://internal.example/log?key=test-value&token=test-token&key=second&text=a%20b",
            {
                headers: {
                    "x-forwarded-host": "gen.pollinations.ai",
                    "x-original-client-ip": "192.0.2.1",
                    "cf-connecting-ip": "192.0.2.2",
                    "user-agent": "logger-test",
                },
            },
            { ENVIRONMENT: environment },
        );
        expect(response.status).toBe(201);
        expect(await response.text()).toBe("ok");
        const requestLogs = records.filter(
            (record) => record.category.join(":") === "hono",
        );
        const verbose = environment === "local" || environment === "test";
        expect(requestLogs.map((record) => record.rawMessage)).toEqual(
            verbose
                ? [
                      "{method} {url}",
                      "handler",
                      "RESPONSE {status} {duration}ms",
                  ]
                : ["handler"],
        );
        for (const record of requestLogs) {
            expect(record.properties).toMatchObject({
                requestId: "test-request",
                method: "GET",
                routePath: publicUrl,
                userAgent: "logger-test",
                ipAddress: "192.0.2.1",
            });
        }
        if (verbose) {
            expect(requestLogs[0].properties.url).toBe(publicUrl);
            expect(requestLogs[2].properties).toMatchObject({
                status: 201,
                duration: expect.any(Number),
            });
        }
    });
});
