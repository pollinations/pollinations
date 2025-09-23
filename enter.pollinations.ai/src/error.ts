import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod/v4";
import { Env } from "./env.ts";
import { APIError } from "better-auth";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { ValidationError } from "@/middleware/validator";

interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
        details?: ErrorDetails;
        timestamp: string;
        requestId?: string;
        cause?: unknown;
    };
    status: ContentfulStatusCode;
}

interface ErrorDetails {
    name: string;
    stack?: string;
    formErrors?: string[];
    fieldErrors?: { [key: string]: string[] };
}

export const handleError: ErrorHandler<Env> = (err, c) => {
    const timestamp = new Date().toISOString();
    const isDevelopment = c.env.ENVIRONMENT === "development";

    if (err instanceof HTTPException) {
        const status = err.status;
        const response = createBaseErrorResponse(
            err,
            status,
            timestamp,
            isDevelopment,
        );
        return c.json(response, status);
    }

    if (err instanceof APIError) {
        const status = err.statusCode as ContentfulStatusCode;
        const response = createBaseErrorResponse(
            err,
            status,
            timestamp,
            isDevelopment,
        );
        return c.json(response, status);
    }

    if (err instanceof ValidationError) {
        const status = 400;
        const response = createValidationErrorResponse(
            err,
            status,
            timestamp,
            isDevelopment,
        );
        return c.json(response, status);
    }

    const status = 500;
    c.var.log.error({
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
    const response = createInternalErrorResponse(
        err,
        status,
        timestamp,
        isDevelopment,
    );
    return c.json(response, status);
};

function createBaseErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
    includeDebugInfo: boolean,
): ErrorResponse {
    return {
        success: false,
        error: {
            message: error.message || getDefaultErrorMessage(status),
            code: getErrorCode(status),
            timestamp,
            ...(includeDebugInfo && !!error.cause && { cause: error.cause }),
        },
        status,
    };
}

function createValidationErrorResponse(
    error: ValidationError,
    status: ContentfulStatusCode,
    timestamp: string,
    includeDebugInfo: boolean,
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
            ...(includeDebugInfo && !!error.cause && { cause: error.cause }),
        },
        status,
    };
}

function createInternalErrorResponse(
    error: Error,
    status: ContentfulStatusCode,
    timestamp: string,
    includeDebugInfo: boolean,
): ErrorResponse {
    return {
        success: false,
        error: {
            message: includeDebugInfo
                ? error.message || getDefaultErrorMessage(status)
                : getDefaultErrorMessage(status),
            code: getErrorCode(status),
            ...(includeDebugInfo && {
                details: {
                    name: error.name,
                    stack: error.stack,
                },
            }),
            timestamp,
            ...(includeDebugInfo && !!error.cause && { cause: error.cause }),
        },
        status,
    };
}

function getErrorCode(status: number): string {
    const codes: Record<number, string> = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
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

function getDefaultErrorMessage(status: number): string {
    const messages: Record<number, string> = {
        400: "Something was wrong with the input data.",
        401: "Please sign in first and provide session cookie or x-api-key header.",
        403: "Access denied! You don't have the required permissions.",
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
