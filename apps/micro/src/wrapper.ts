import { MicroService } from "./services/microService.js";
import type { EmailConfig } from "./types/index.js";

export class MicroServiceWrapper extends MicroService {
    verifyConnection(): Promise<boolean> {
        return this.verifyEmailConnection();
    }
}

export function createMicroServiceWrapper(
    emailConfig: EmailConfig,
): MicroServiceWrapper {
    return new MicroServiceWrapper(emailConfig);
}

// Export types for external use
export type {
    EmailConfig,
    EmailMessage,
    EmailServiceResponse,
} from "./types/index.js";
export { EmailConfigSchema, EmailMessageSchema } from "./types/index.js";
