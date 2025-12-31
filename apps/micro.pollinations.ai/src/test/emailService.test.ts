import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailService } from "../services/emailService.js";
import type { EmailConfig } from "../types/index.js";

// Mock Resend
vi.mock("resend", () => ({
    Resend: vi.fn().mockImplementation(() => ({
        emails: {
            send: vi.fn().mockResolvedValue({ data: { id: "test-resend-id" } }),
        },
    })),
}));

// Mock fetch for Brevo
global.fetch = vi.fn();

describe("EmailService", () => {
    let emailService: EmailService;
    let brevoConfig: EmailConfig;
    let resendConfig: EmailConfig;

    beforeEach(() => {
        brevoConfig = {
            provider: "brevo",
            brevo: {
                apiKey: "test-brevo-key",
                senderEmail: "test@example.com",
            },
        };

        resendConfig = {
            provider: "resend",
            resend: {
                apiKey: "test-resend-key",
            },
        };
    });

    describe("Brevo Provider", () => {
        beforeEach(() => {
            emailService = new EmailService(brevoConfig);
            // Mock successful Brevo API response
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ messageId: "test-brevo-id" }),
            });
        });

        it("should send email via Brevo", async () => {
            const message = {
                to: "recipient@example.com",
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
            expect(result.messageId).toBe("test-brevo-id");
            expect(global.fetch).toHaveBeenCalledWith(
                "https://api.brevo.com/v3/smtp/email",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        "api-key": "test-brevo-key",
                    }),
                }),
            );
        });

        it("should handle multiple recipients", async () => {
            const message = {
                to: ["recipient1@example.com", "recipient2@example.com"],
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
        });

        it("should handle CC and BCC", async () => {
            const message = {
                to: "recipient@example.com",
                cc: "cc@example.com",
                bcc: "bcc@example.com",
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
        });

        it("should verify connection", async () => {
            const isConnected = await emailService.verifyConnection();
            expect(isConnected).toBe(true);
        });
    });

    describe("Resend Provider", () => {
        beforeEach(() => {
            emailService = new EmailService(resendConfig);
        });

        it("should send email via Resend", async () => {
            const message = {
                to: "recipient@example.com",
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
            expect(result.messageId).toBe("test-resend-id");
        });

        it("should handle multiple recipients", async () => {
            const message = {
                to: ["recipient1@example.com", "recipient2@example.com"],
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
        });

        it("should handle HTML content", async () => {
            const message = {
                to: "recipient@example.com",
                subject: "Test Subject",
                html: "<h1>Test HTML</h1>",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
        });

        it("should handle CC and BCC", async () => {
            const message = {
                to: "recipient@example.com",
                cc: "cc@example.com",
                bcc: "bcc@example.com",
                subject: "Test Subject",
                text: "Test message",
            };

            const result = await emailService.sendMail(message);

            expect(result.success).toBe(true);
        });

        it("should verify connection", async () => {
            const isConnected = await emailService.verifyConnection();
            expect(isConnected).toBe(true);
        });
    });

    describe("Template Rendering", () => {
        beforeEach(() => {
            emailService = new EmailService(brevoConfig);
        });

        it("should render template with variables", () => {
            const template = {
                name: "test",
                subject: "Hello {{name}}!",
                html: "<h1>Hello {{name}}!</h1>",
                text: "Hello {{name}}!",
                variables: ["name"],
            };

            const variables = { name: "John" };
            const result = emailService.renderTemplate(template, variables);

            expect(result.subject).toBe("Hello John!");
            expect(result.html).toBe("<h1>Hello John!</h1>");
            expect(result.text).toBe("Hello John!");
        });
    });
});
