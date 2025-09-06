import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import z, { ZodError } from "zod";
import { Env } from "./env.ts";

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
    status: number;
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
        const response: ErrorResponse = {
            success: false,
            error: {
                message: err.message || getDefaultErrorMessage(status),
                code: getErrorCode(status),
                timestamp,
                ...(isDevelopment && !!err.cause && { cause: err.cause }),
            },
            status,
        };
        return c.json(response, status);
    }

    if (err instanceof ZodError) {
        const flatErrors = z.flattenError(err);
        const status = 400;
        const response: ErrorResponse = {
            success: false,
            error: {
                message: getDefaultErrorMessage(status),
                code: getErrorCode(status),
                details: {
                    name: err.name,
                    ...flatErrors,
                },
                timestamp: new Date().toISOString(),
                ...(isDevelopment && !!err.cause && { cause: err.cause }),
            },
            status,
        };
        return c.json(response, status);
    }

    const status = 500;
    const response: ErrorResponse = {
        success: false,
        error: {
            message: isDevelopment
                ? err.message || getDefaultErrorMessage(status)
                : getDefaultErrorMessage(status),
            code: getErrorCode(status),
            ...(isDevelopment && {
                details: {
                    stack: err.stack,
                    name: err.name,
                },
            }),
            timestamp,
            ...(isDevelopment && !!err.cause && { cause: err.cause }),
        },
        status,
    };
    return c.json(response, status);
};

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
