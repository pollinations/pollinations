import type { EmailConfig } from "../../../src/types/email";

export function emailConfigFromEnvironment(): EmailConfig | string {
    const provider = process.env.EMAIL_PROVIDER || "brevo";

    if (provider === "brevo") {
        if (!process.env.BREVO_KEY || !process.env.BREVO_MAIL) {
            return "Brevo configuration is incomplete";
        }
        return {
            provider,
            brevo: {
                apiKey: process.env.BREVO_KEY,
                senderEmail: process.env.BREVO_MAIL,
            },
        };
    }

    if (provider === "resend") {
        if (!process.env.RESEND_API_KEY) {
            return "Resend configuration is incomplete";
        }
        return {
            provider,
            resend: { apiKey: process.env.RESEND_API_KEY },
        };
    }

    return "Invalid email provider";
}
