import { APIError } from "better-auth";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { ValidationError } from "@/middleware/validator";
import type { Env } from "./env.ts";

type UpstreamErrorOptions = {
    res?: Response;
    message?: string;
    cause?: unknown;
    requestUrl?: URL;
    requestBody?: unknown;
};

export class UpstreamError extends HTTPException {
    public readonly name = "UpstreamError" as const;
    public readonly requestUrl?: URL;
    public readonly requestBody?: unknown;

    constructor(status: ContentfulStatusCode, options?: UpstreamErrorOptions) {
        super(status, options);
        this.requestUrl = options?.requestUrl;
        this.requestBody = options?.requestBody;
    }
}

const GenericErrorDetailsSchema = z
    .object({
        name: z.string(),
        stack: z.string().optional(),
    })
    .meta({ $id: "ErrorDetails" });

const ValidationErrorDetailsSchema = z
    .object({
        name: z.string(),
        stack: z.string().optional(),
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

export const handleError: ErrorHandler<Env> = async (err, c) => {
    const log = c.get("log");
    const timestamp = new Date().toISOString();

    // Set the error on the context for it to be tracked
    c.set("error", err);

    // Check for UpstreamError first (more specific than HTTPException)
    // Use name check as fallback for bundling/prototype chain issues
    if (err instanceof UpstreamError || err.name === "UpstreamError") {
        const status = (err as UpstreamError).status;
        const response = createBaseErrorResponse(err, status, timestamp);
        log.trace("UpstreamError: {message}", {
            message: err.message || getDefaultErrorMessage(status),
        });
        return c.json(response, status);
    }

    if (err instanceof HTTPException) {
        const status = err.status;
        const response = createBaseErrorResponse(err, status, timestamp);
        log.trace("HttpException: {message}", {
            message: err.message || getDefaultErrorMessage(err.status),
        });
        return c.json(response, status);
    }

    if (err instanceof APIError) {
        const status = err.statusCode as ContentfulStatusCode;
        const response = createBaseErrorResponse(err, status, timestamp);
        log.trace("APIError: {error}", { error: err });
        return c.json(response, status);
    }

    if (err instanceof ValidationError) {
        const status = 400;
        const response = createValidationErrorResponse(err, status, timestamp);
        log.trace("ValidationError: {error}", { error: err });
        return c.json(response, status);
    }

    const status = 500;
    const user = (c.var as any).auth?.user;
    log.error("InternalError: {*}", {
        ...(user && { userId: user.id, username: user.username }),
        error: {
            message: err.message || getDefaultErrorMessage(status),
            code: getErrorCode(status),
            details: {
                name: err.name,
                stack: err.stack,
            },
            cause: err.cause,
        },
    });
    const response = createInternalErrorResponse(err, status, timestamp);
    return c.json(response, status);
};

function createBaseErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
): ErrorResponse {
    return {
        success: false,
        error: {
            message: error.message || getDefaultErrorMessage(status),
            code: getErrorCode(status),
            timestamp,
            ...(!!error.cause && { cause: error.cause }),
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
    return {
        success: false,
        error: {
            message: error.message || getDefaultErrorMessage(status),
            code: getErrorCode(status),
            details: {
                name: error.name,
                ...flatErrors,
            },
            timestamp,
            ...(!!error.cause && { cause: error.cause }),
        },
        status,
    };
}

function createInternalErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
): ErrorResponse {
    return {
        success: false,
        error: {
            message: error.message || getDefaultErrorMessage(status),
            code: getErrorCode(status),
            details: {
                name: error.name,
                stack: error.stack,
            },
            timestamp,
            ...(!!error.cause && { cause: error.cause }),
        },
        status,
    };
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
        401: "You need to authenticate by providing a session cookie or Authorization header (Bearer token).",
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
