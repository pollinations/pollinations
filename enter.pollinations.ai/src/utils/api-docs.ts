import type { ContentfulStatusCode } from "hono/utils/http-status";
import { resolver } from "hono-openapi";
import {
    createErrorResponseSchema,
    type ErrorStatusCode,
    getDefaultErrorMessage,
    KNOWN_ERROR_STATUS_CODES,
} from "@/error.ts";

function createErrorResponseDescription(status: ContentfulStatusCode) {
    return {
        description: getDefaultErrorMessage(status),
        content: {
            "application/json": {
                schema: resolver(createErrorResponseSchema(status)),
            },
        },
    };
}

export function errorResponseDescriptions(...codes: ErrorStatusCode[]) {
    return Object.fromEntries(
        KNOWN_ERROR_STATUS_CODES.filter((status) => codes.includes(status)).map(
            (status) => [status, createErrorResponseDescription(status)],
        ),
    );
}
