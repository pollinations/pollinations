import {
    createLoggerMiddleware,
    type LoggerVariables,
} from "@shared/middleware/logger.ts";

export { createLoggerMiddleware, type LoggerVariables };

export const logger = createLoggerMiddleware({
    redactCredentialQueryParams: false,
});
