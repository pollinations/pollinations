import { Resend } from "resend";
import type {
    EmailConfig,
    EmailMessage,
    EmailServiceResponse,
    EmailTemplate,
} from "../types/index";

export class EmailService {
    private config: EmailConfig;
    private resend?: Resend;

    constructor(config: EmailConfig) {
        this.config = config;
        this.initializeProvider();
    }

    private initializeProvider(): void {
        if (this.config.provider === "resend" && this.config.resend) {
            this.resend = new Resend(this.config.resend.apiKey);
        }
        // Brevo doesn't need initialization - we'll use fetch directly
    }

    async sendMail(message: EmailMessage): Promise<EmailServiceResponse> {
        try {
            if (this.config.provider === "brevo") {
                return await this.sendViaBrevo(message);
            } else if (this.config.provider === "resend") {
                return await this.sendViaResend(message);
            } else {
                throw new Error("No email provider configured");
            }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error occurred",
            };
        }
    }

    private async sendViaBrevo(
        message: EmailMessage,
    ): Promise<EmailServiceResponse> {
        if (!this.config.brevo?.apiKey || !this.config.brevo?.senderEmail) {
            throw new Error("Brevo configuration is incomplete");
        }

        const payload: any = {
            sender: { email: this.config.brevo.senderEmail },
            to: Array.isArray(message.to)
                ? message.to.map((email) => ({ email }))
                : [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html || message.text,
        };

        // Add CC if provided
        if (message.cc) {
            payload.cc = Array.isArray(message.cc)
                ? message.cc.map((email) => ({ email }))
                : [{ email: message.cc }];
        }

        // Add BCC if provided
        if (message.bcc) {
            payload.bcc = Array.isArray(message.bcc)
                ? message.bcc.map((email) => ({ email }))
                : [{ email: message.bcc }];
        }

        // Add reply-to if provided
        if (message.replyTo) {
            payload.replyTo = { email: message.replyTo };
        }

        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "api-key": this.config.brevo.apiKey,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Brevo API error");
        }

        return {
            success: true,
            messageId: data.messageId || `brevo-${Date.now()}`,
        };
    }

    private async sendViaResend(
        message: EmailMessage,
    ): Promise<EmailServiceResponse> {
        if (!this.resend) {
            throw new Error("Resend not initialized");
        }

        const emailData: any = {
            from: message.from || "Pollinations AI <noreply@pollinations.ai>",
            to: Array.isArray(message.to) ? message.to : [message.to],
            subject: message.subject,
        };

        if (message.html) {
            emailData.html = message.html;
        }
        if (message.text) {
            emailData.text = message.text;
        }

        // Add CC if provided
        if (message.cc) {
            emailData.cc = Array.isArray(message.cc)
                ? message.cc
                : [message.cc];
        }

        // Add BCC if provided
        if (message.bcc) {
            emailData.bcc = Array.isArray(message.bcc)
                ? message.bcc
                : [message.bcc];
        }

        // Add reply-to if provided
        if (message.replyTo) {
            emailData.replyTo = message.replyTo;
        }

        // Add attachments if provided
        if (message.attachments) {
            emailData.attachments = message.attachments.map((att) => ({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType,
            }));
        }

        const result = await this.resend.emails.send(emailData);

        return {
            success: true,
            messageId: result.data?.id || `resend-${Date.now()}`,
        };
    }

    // Template rendering methods
    renderTemplate(
        template: EmailTemplate,
        variables: Record<string, string>,
    ): EmailMessage {
        let html = template.html;
        let text = template.text || "";
        let subject = template.subject;

        // Replace variables in template
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, "g");
            html = html.replace(regex, value);
            text = text.replace(regex, value);
            subject = subject.replace(regex, value);
        });

        return {
            to: "", // Will be set when sending
            subject,
            html,
            text: text || undefined,
        };
    }

    // Verify email configuration
    async verifyConnection(): Promise<boolean> {
        try {
            if (this.config.provider === "brevo") {
                // For Brevo, we'll check if the API key and sender email are configured
                return !!(
                    this.config.brevo?.apiKey && this.config.brevo?.senderEmail
                );
            } else if (this.config.provider === "resend") {
                // For Resend, we'll check if the API key is configured
                return !!this.config.resend?.apiKey;
            }
            return false;
        } catch (error) {
            console.error("Email connection verification failed:", error);
            return false;
        }
    }
}
