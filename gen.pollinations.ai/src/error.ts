import type { Logger } from "@logtape/logtape";
import { ValidationError } from "@shared/http/validation-error.ts";
import { APIError } from "better-auth";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RequestIdVariables } from "hono/request-id";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
    type TinybirdErrorEvent,
} from "@/events.ts";
import { getRoutePath } from "@/util.ts";
import { redactSecrets } from "@/utils/secret-redaction.ts";
import type { ErrorVariables } from "./env.ts";
import type { LoggerVariables } from "./middleware/logger.ts";

type ErrorHandlerEnv = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};

type UpstreamErrorOptions = {
    res?: Response;
    message?: string;
    cause?: unknown;
    requestUrl?: URL;
    requestBody?: unknown;
    upstreamStatus?: number;
    responseBody?: string;
};

export class UpstreamError extends HTTPException {
    public readonly name = "UpstreamError" as const;
    public readonly requestUrl?: URL;
    public readonly requestBody?: unknown;
    public readonly upstreamStatus?: number;
    public readonly responseBody?: string;

    constructor(status: ContentfulStatusCode, options?: UpstreamErrorOptions) {
        super(status, options && redactUpstreamErrorOptions(options));
        this.requestUrl = options?.requestUrl;
        this.requestBody = redactSecrets(options?.requestBody);
        this.upstreamStatus = options?.upstreamStatus;
        this.responseBody = redactSecrets(options?.responseBody);
    }
}

function redactUpstreamErrorOptions(
    options: UpstreamErrorOptions,
): UpstreamErrorOptions {
    return {
        ...options,
        message: redactSecrets(options.message),
        requestBody: redactSecrets(options.requestBody),
        responseBody: redactSecrets(options.responseBody),
        cause: redactSecrets(options.cause),
    };
}

export async function ensureUpstreamOk(
    response: Response,
    requestUrl: string | URL,
): Promise<Response> {
    if (response.ok) return response;
    const responseBody = await response.text();
    const rawMessage =
        extractUpstreamMessage(responseBody) ||
        getDefaultErrorMessage(response.status);
    throw new UpstreamError(remapUpstreamStatus(response.status), {
        message: truncateString(rawMessage, MAX_ERROR_MESSAGE_LENGTH) ?? "",
        requestUrl:
            typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl,
        upstreamStatus: response.status,
        responseBody,
    });
}

function extractUpstreamMessage(body: string): string {
    try {
        const parsed = JSON.parse(body);
        const extracted =
            parsed?.details?.error?.message ||
            parsed?.error?.message ||
            parsed?.message ||
            (typeof parsed?.error === "string" ? parsed.error : null);
        if (typeof extracted === "string" && extracted) return extracted;
    } catch {
        // Not JSON - fall through to raw body
    }
    return body;
}

const GenericErrorDetailsSchema = z
    .object({
        name: z.string(),
        upstreamStatus: z.number().int().optional(),
        upstreamHost: z.string().optional(),
        upstreamBody: z.string().optional(),
    })
    .meta({ $id: "ErrorDetails" });

const ValidationErrorDetailsSchema = z
    .object({
        name: z.string(),
        formErrors: z.array(z.string()),
        fieldErrors: z.record(z.string(), z.array(z.string())),
    })
    .meta({ $id: "ValidationErrorDetails" });

export function createErrorResponseSchema(
    status: ContentfulStatusCode,
): z.ZodObject {
    const errorDetailsSchema =
        status === 400
            ? ValidationErrorDetailsSchema
            : GenericErrorDetailsSchema;
    return z.object({
        status: z.literal(status),
        success: z.literal(false),
        error: z.object({
            code: z.literal(getErrorCode(status)),
            message: z.union([
                z.literal(getDefaultErrorMessage(status)),
                z.string(),
            ]),
            timestamp: z.string(),
            details: errorDetailsSchema,
            requestId: z.string().optional(),
            cause: z.unknown().optional(),
        }),
    });
}

export const GenericErrorResponseSchema = z.object({
    status: z.number().int().min(100).max(599),
    success: z.boolean(),
    error: z.object({
        code: z.string(),
        message: z.string(),
        timestamp: z.string(),
        details: GenericErrorDetailsSchema.optional(),
        requestId: z.string().optional(),
        cause: z.unknown().optional(),
    }),
});

const ErrorResponseSchema = z.discriminatedUnion("status", [
    createErrorResponseSchema(400),
    GenericErrorResponseSchema,
]);

type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

type ServerErrorEnvelope = {
    kind: "server_error";
    severity: "error";
    timestamp: string;
    requestId?: string;
    environment?: string;
    routePath: string;
    method: string;
    status: number;
    durationMs?: number;
    errorCode: string;
    errorClass: string;
    message: string;
    stack?: string;
    upstreamHost?: string;
    upstreamStatus?: number;
    upstreamBody?: string;
    modelRequested?: string;
    resolvedModelRequested?: string;
    userId?: string;
    userTier?: string;
    apiKeyId?: string;
};

const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 12000;
const MAX_UPSTREAM_BODY_LENGTH = 16000;

export async function handleError<TEnv extends ErrorHandlerEnv>(
    err: Error,
    c: Context<TEnv>,
) {
    const log = c.get("log");
    const timestamp = new Date().toISOString();

    c.set("error", err);

    if (err instanceof UpstreamError) {
        const status = err.status;
        if (status >= 500) emitServerError(c, err, status, timestamp, log);
        else {
            log.trace("UpstreamError: {message}", {
                message: err.message || getDefaultErrorMessage(err.status),
            });
        }
        return c.json(
            createUpstreamErrorResponse(err, status, timestamp),
            status,
        );
    }

    if (err instanceof HTTPException) {
        const status = err.status;
        if (status >= 500) emitServerError(c, err, status, timestamp, log);
        else {
            log.trace("HttpException: {message}", {
                message: err.message || getDefaultErrorMessage(err.status),
            });
        }
        return c.json(createErrorResponse(err, status, timestamp), status);
    }

    if (err instanceof APIError) {
        const status = err.statusCode as ContentfulStatusCode;
        if (status >= 500) emitServerError(c, err, status, timestamp, log);
        else log.trace("APIError: {error}", { error: err });
        return c.json(createErrorResponse(err, status, timestamp), status);
    }

    if (err instanceof ValidationError) {
        const status = 400;
        const response = createValidationErrorResponse(err, status, timestamp);
        log.trace("ValidationError: {error}", { error: err });
        return c.json(response, status);
    }

    const status = 500;
    emitServerError(c, err, status, timestamp, log);
    const response = createInternalErrorResponse(err, status, timestamp);
    return c.json(response, status);
}

function createErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
    details?: Record<string, unknown>,
): ErrorResponse {
    return {
        success: false,
        error: {
            message: redactSecrets(
                error.message || getDefaultErrorMessage(status),
            ),
            code: getErrorCode(status),
            timestamp,
            ...(details && { details: redactSecrets(details) }),
            ...(!!error.cause && { cause: redactSecrets(error.cause) }),
        },
        status,
    };
}

function createValidationErrorResponse(
    error: ValidationError,
    status: ContentfulStatusCode,
    timestamp: string,
): ErrorResponse {
    const flatErrors = z.flattenError(error.zodError);
    return createErrorResponse(error, status, timestamp, {
        name: error.name,
        ...flatErrors,
    });
}

function createInternalErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
): ErrorResponse {
    return createErrorResponse(error, status, timestamp, {
        name: error.name,
    });
}

function createUpstreamErrorResponse(
    error: UpstreamError,
    status: ContentfulStatusCode,
    timestamp: string,
): ErrorResponse {
    return createErrorResponse(error, status, timestamp, {
        name: error.name,
        upstreamStatus: error.upstreamStatus,
        upstreamHost: error.requestUrl?.hostname,
        upstreamBody: truncateString(
            error.responseBody,
            MAX_UPSTREAM_BODY_LENGTH,
        ),
    });
}

export function remapUpstreamStatus(status: number): ContentfulStatusCode {
    const remapTo502 = new Set([401, 403, 404, 409, 415, 429]);
    if (remapTo502.has(status)) return 502;
    return status as ContentfulStatusCode;
}

export function getErrorCode(status: number): string {
    const codes: Record<number, string> = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        402: "PAYMENT_REQUIRED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        422: "UNPROCESSABLE_ENTITY",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        502: "BAD_GATEWAY",
        503: "SERVICE_UNAVAILABLE",
    };
    return codes[status] || "UNKNOWN_ERROR";
}

export const KNOWN_ERROR_STATUS_CODES = [
    400, 401, 402, 403, 405, 409, 422, 429, 500, 502, 503,
] as const;

export type ErrorStatusCode = (typeof KNOWN_ERROR_STATUS_CODES)[number];

export function getDefaultErrorMessage(status: number): string {
    const messages: Record<number, string> = {
        400: "Something was wrong with the input data, check the details for more info.",
        401: "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
        402: "Insufficient pollen balance or API key budget exhausted.",
        403: "Access denied! You don't have the required permissions for this resource or model.",
        404: "Oh no, there's nothing here.",
        405: "That HTTP method isn't supported here. Please check the API docs.",
        409: "Something with these details already exists. Maybe update it instead?",
        422: "Your request looks good, but some required fields are missing or invalid.",
        429: "You're making requests too quickly. Please slow down a bit.",
        500: "Oh snap, something went wrong on our end. We're on it!",
        502: "We couldn't reach our backend services. Please try again shortly.",
        503: "We're temporarily down for maintenance. Sorry about that!",
    };
    return messages[status] || "UNKNOWN_ERROR";
}

function emitServerError<TEnv extends ErrorHandlerEnv>(
    c: Context<TEnv>,
    error: Error,
    status: number,
    timestamp: string,
    log: Logger,
): void {
    const envelope = createServerErrorEnvelope(c, error, status, timestamp);
    log.error(
        "server_error route={routePath} status={status} class={errorClass}",
        envelope,
    );

    c.executionCtx.waitUntil(
        sendErrorEventToTinybird(
            toTinybirdErrorEvent(envelope),
            getTinybirdDatasourceIngestUrl(
                c.env.TINYBIRD_INGEST_URL,
                "error_event",
            ),
            c.env.TINYBIRD_INGEST_TOKEN,
            log,
        ),
    );
}

function createServerErrorEnvelope<TEnv extends ErrorHandlerEnv>(
    c: Context<TEnv>,
    error: Error,
    status: number,
    timestamp: string,
): ServerErrorEnvelope {
    const vars = c.var as Partial<{
        auth: {
            user?: { id?: string; tier?: string };
            apiKey?: { id?: string };
        };
        model: {
            requested: string;
            resolved: string;
        };
        requestStartedAt: number;
    }>;
    const message =
        redactSecrets(
            truncateString(
                error.message || getDefaultErrorMessage(status),
                MAX_ERROR_MESSAGE_LENGTH,
            ) || getDefaultErrorMessage(status),
        ) || getDefaultErrorMessage(status);
    const stack = redactSecrets(truncateString(error.stack, MAX_STACK_LENGTH));
    const resolvedRoutePath = getRoutePath(c);

    return {
        kind: "server_error",
        severity: "error",
        timestamp,
        requestId: c.get("requestId"),
        environment: c.env.ENVIRONMENT,
        routePath: resolvedRoutePath,
        method: c.req.method,
        status,
        durationMs:
            vars.requestStartedAt === undefined
                ? undefined
                : Date.now() - vars.requestStartedAt,
        errorCode: getErrorCode(status),
        errorClass: error.name,
        message,
        stack,
        upstreamHost:
            error instanceof UpstreamError
                ? error.requestUrl?.hostname
                : undefined,
        upstreamStatus:
            error instanceof UpstreamError ? error.upstreamStatus : undefined,
        upstreamBody:
            error instanceof UpstreamError
                ? redactSecrets(
                      truncateString(
                          error.responseBody,
                          MAX_UPSTREAM_BODY_LENGTH,
                      ),
                  )
                : undefined,
        modelRequested: vars.model?.requested,
        resolvedModelRequested: vars.model?.resolved,
        userId: vars.auth?.user?.id,
        userTier: vars.auth?.user?.tier,
        apiKeyId: vars.auth?.apiKey?.id,
    };
}

function toTinybirdErrorEvent(
    envelope: ServerErrorEnvelope,
): TinybirdErrorEvent {
    return {
        timestamp: envelope.timestamp,
        kind: envelope.kind,
        severity: envelope.severity,
        request_id: envelope.requestId,
        environment: envelope.environment,
        route_path: envelope.routePath,
        method: envelope.method,
        status: envelope.status,
        duration_ms: envelope.durationMs,
        error_code: envelope.errorCode,
        error_class: envelope.errorClass,
        message: envelope.message,
        stack: envelope.stack,
        upstream_host: envelope.upstreamHost,
        upstream_status: envelope.upstreamStatus,
        upstream_body: envelope.upstreamBody,
        model_requested: envelope.modelRequested,
        resolved_model_requested: envelope.resolvedModelRequested,
        user_id: envelope.userId,
        user_tier: envelope.userTier,
        api_key_id: envelope.apiKeyId,
    };
}

function truncateString(
    value: string | undefined,
    maxLength: number,
): string | undefined {
    if (!value) return undefined;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}
