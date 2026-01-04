import { z } from "zod";

// Email provider types
export type EmailProvider = "brevo" | "resend";

// Email configuration schema
export const EmailConfigSchema = z.object({
    provider: z.enum(["brevo", "resend"]),
    brevo: z
        .object({
            apiKey: z.string(),
            senderEmail: z.string(),
        })
        .optional(),
    resend: z
        .object({
            apiKey: z.string(),
        })
        .optional(),
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

// Email message schema
export const EmailMessageSchema = z.object({
    to: z.union([z.string(), z.array(z.string())]),
    from: z.string().optional(),
    subject: z.string(),
    text: z.string().optional(),
    html: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    replyTo: z.string().optional(),
    attachments: z
        .array(
            z.object({
                filename: z.string(),
                content: z.string(),
                contentType: z.string().optional(),
            }),
        )
        .optional(),
});

export type EmailMessage = z.infer<typeof EmailMessageSchema>;

// Email template schema
export const EmailTemplateSchema = z.object({
    name: z.string(),
    subject: z.string(),
    html: z.string(),
    text: z.string().optional(),
    variables: z.array(z.string()).optional(),
});

export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

// Email service response
export interface EmailServiceResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

// Service configuration
export interface ServiceConfig {
    port: number;
    nodeEnv: string;
    email: EmailConfig;
    corsOrigin: string;
}
