import { MicroService } from "./services/microService.js";
import type {
    EmailConfig,
    EmailMessage,
    EmailServiceResponse,
} from "./types/index.js";

/**
 * Micro Service Wrapper
 *
 * This wrapper provides a simple interface for integrating the micro service
 * into other applications without needing to set up the full server.
 *
 * Usage:
 * ```typescript
 * import { createMicroServiceWrapper } from './wrapper.js';
 *
 * const wrapper = createMicroServiceWrapper({
 *   provider: 'smtp',
 *   smtp: { host: 'smtp.gmail.com', port: 587, user: '...', pass: '...' }
 * });
 *
 * await wrapper.sendMail({ to: 'user@example.com', subject: 'Hello', text: 'World' });
 * ```
 */

export interface MicroServiceWrapper {
    sendMail(message: EmailMessage): Promise<EmailServiceResponse>;
    sendWelcomeEmail(
        to: string | string[],
        userName: string,
        serviceName?: string,
    ): Promise<EmailServiceResponse>;
    sendPasswordResetEmail(
        to: string | string[],
        userName: string,
        resetLink: string,
        serviceName?: string,
        expiryTime?: string,
    ): Promise<EmailServiceResponse>;
    sendNotificationEmail(
        to: string | string[],
        title: string,
        message: string,
        serviceName?: string,
    ): Promise<EmailServiceResponse>;
    verifyConnection(): Promise<boolean>;
    getTemplates(): Record<string, any>;
}

export function createMicroServiceWrapper(
    emailConfig: EmailConfig,
): MicroServiceWrapper {
    const microService = new MicroService(emailConfig);

    return {
        async sendMail(message: EmailMessage): Promise<EmailServiceResponse> {
            return microService.sendMail(message);
        },

        async sendWelcomeEmail(
            to: string | string[],
            userName: string,
            serviceName?: string,
        ): Promise<EmailServiceResponse> {
            return microService.sendWelcomeEmail(to, userName, serviceName);
        },

        async sendPasswordResetEmail(
            to: string | string[],
            userName: string,
            resetLink: string,
            serviceName?: string,
            expiryTime?: string,
        ): Promise<EmailServiceResponse> {
            return microService.sendPasswordResetEmail(
                to,
                userName,
                resetLink,
                serviceName,
                expiryTime,
            );
        },

        async sendNotificationEmail(
            to: string | string[],
            title: string,
            message: string,
            serviceName?: string,
        ): Promise<EmailServiceResponse> {
            return microService.sendNotificationEmail(
                to,
                title,
                message,
                serviceName,
            );
        },

        async verifyConnection(): Promise<boolean> {
            return microService.verifyEmailConnection();
        },

        getTemplates(): Record<string, any> {
            return microService.getTemplates();
        },
    };
}

// Export types for external use
export type {
    EmailConfig,
    EmailMessage,
    EmailServiceResponse,
} from "./types/index.js";
export { EmailConfigSchema, EmailMessageSchema } from "./types/index.js";
