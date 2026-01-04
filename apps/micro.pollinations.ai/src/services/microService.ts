import type {
    EmailConfig,
    EmailMessage,
    EmailServiceResponse,
    EmailTemplate,
} from "../types/index";
import { EmailService } from "./emailService";

export class MicroService {
    private emailService: EmailService;

    constructor(emailConfig: EmailConfig) {
        this.emailService = new EmailService(emailConfig);
    }

    // Email utilities
    async sendMail(message: EmailMessage): Promise<EmailServiceResponse> {
        return this.emailService.sendMail(message);
    }

    async sendTemplateMail(
        template: EmailTemplate,
        to: string | string[],
        variables: Record<string, string> = {},
    ): Promise<EmailServiceResponse> {
        const message = this.emailService.renderTemplate(template, variables);
        message.to = to;
        return this.emailService.sendMail(message);
    }

    async verifyEmailConnection(): Promise<boolean> {
        return this.emailService.verifyConnection();
    }

    // Predefined email templates
    getTemplates(): Record<string, EmailTemplate> {
        return {
            welcome: {
                name: "welcome",
                subject: "Welcome to {{serviceName}}!",
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Welcome to {{serviceName}}!</h1>
            <p>Hi {{userName}},</p>
            <p>Thank you for joining {{serviceName}}. We're excited to have you on board!</p>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Best regards,<br>The {{serviceName}} Team</p>
          </div>
        `,
                text: "Welcome to {{serviceName}}! Hi {{userName}}, thank you for joining us.",
                variables: ["serviceName", "userName"],
            },
            passwordReset: {
                name: "passwordReset",
                subject: "Reset your {{serviceName}} password",
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Password Reset Request</h1>
            <p>Hi {{userName}},</p>
            <p>You requested to reset your password for {{serviceName}}.</p>
            <p>Click the link below to reset your password:</p>
            <a href="{{resetLink}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>This link will expire in {{expiryTime}}.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <p>Best regards,<br>The {{serviceName}} Team</p>
          </div>
        `,
                text: "Password Reset Request. Click {{resetLink}} to reset your password.",
                variables: [
                    "userName",
                    "serviceName",
                    "resetLink",
                    "expiryTime",
                ],
            },
            notification: {
                name: "notification",
                subject: "{{title}}",
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">{{title}}</h1>
            <p>{{message}}</p>
            <p>Best regards,<br>{{serviceName}}</p>
          </div>
        `,
                text: "{{title}} - {{message}}",
                variables: ["title", "message", "serviceName"],
            },
        };
    }

    // Utility methods for common email patterns
    async sendWelcomeEmail(
        to: string | string[],
        userName: string,
        serviceName: string = "Pollinations AI",
    ): Promise<EmailServiceResponse> {
        const template = this.getTemplates().welcome;
        return this.sendTemplateMail(template, to, { userName, serviceName });
    }

    async sendPasswordResetEmail(
        to: string | string[],
        userName: string,
        resetLink: string,
        serviceName: string = "Pollinations AI",
        expiryTime: string = "24 hours",
    ): Promise<EmailServiceResponse> {
        const template = this.getTemplates().passwordReset;
        return this.sendTemplateMail(template, to, {
            userName,
            serviceName,
            resetLink,
            expiryTime,
        });
    }

    async sendNotificationEmail(
        to: string | string[],
        title: string,
        message: string,
        serviceName: string = "Pollinations AI",
    ): Promise<EmailServiceResponse> {
        const template = this.getTemplates().notification;
        return this.sendTemplateMail(template, to, {
            title,
            message,
            serviceName,
        });
    }
}
