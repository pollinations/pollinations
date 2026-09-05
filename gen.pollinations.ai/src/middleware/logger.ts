import { createRequestLogger } from "@shared/middleware/logger.ts";
import { redactCredentialQueryParams } from "@shared/observability/request-inputs.ts";

export type { LoggerVariables } from "@shared/middleware/logger.ts";

export const logger = createRequestLogger(redactCredentialQueryParams);
