import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import z, { ZodError } from "zod";

interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code?: string;
        details?: ErrorDetails;
        timestamp: string;
        requestId?: string;
    };
    status: number;
}

interface ErrorDetails {
    name: string;
    stack?: string;
    formErrors?: string[];
    fieldErrors?: { [key: string]: string[] };
}

export const handleError: ErrorHandler<{ Bindings: CloudflareBindings }> = (
    err,
    c,
) => {
    const timestamp = new Date().toISOString();

    if (err instanceof HTTPException) {
        const status = err.status;
        return c.json<ErrorResponse>(
            {
                success: false,
                error: {
                    message: err.message,
                    code: getErrorCode(status),
                    timestamp,
                },
                status,
            },
            status,
        );
    }

    if (err instanceof ZodError) {
        const flatErrors = z.flattenError(err);
        return c.json<ErrorResponse>({
            success: false,
            error: {
                message: "Uh oh, there was something wrong with the input.",
                code: "BAD_REQUEST",
                details: {
                    name: err.name,
                    ...flatErrors,
                },
                timestamp: new Date().toISOString(),
            },
            status: 400,
        });
    }

    const isDevelopment = c.env.ENVIRONMENT === "development";

    return c.json<ErrorResponse>(
        {
            success: false,
            error: {
                message: isDevelopment
                    ? err.message
                    : "Oh snap, something went wrong on our end. We're on it!",
                code: "INTERNAL_ERROR",
                ...(isDevelopment && {
                    details: {
                        stack: err.stack,
                        name: err.name,
                    },
                }),
                timestamp,
            },
            status: 500,
        },
        500,
    );
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
