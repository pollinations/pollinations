import { createRequestLogger } from "@shared/middleware/logger.ts";

export type { LoggerVariables } from "@shared/middleware/logger.ts";

export const logger = createRequestLogger((url) => url.toString());
