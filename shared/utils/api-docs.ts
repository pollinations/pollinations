import type { ContentfulStatusCode } from "hono/utils/http-status";
import { resolver } from "hono-openapi";
import {
    createErrorResponseSchema,
    type ErrorStatusCode,
    getDefaultErrorMessage,
    KNOWN_ERROR_STATUS_CODES,
} from "../error.ts";

export const mediaResponseHeaders = {
    Link: {
        description:
            'Public stored-file URL with rel="enclosure". Fetching it never generates media; expired files return 404. Also included when the file is wrapped in URL or base64 JSON.',
        schema: { type: "string" as const },
        example:
            '<https://media.pollinations.ai/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef>; rel="enclosure"',
    },
};

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
