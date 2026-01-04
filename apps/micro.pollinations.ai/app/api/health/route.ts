import { NextResponse } from "next/server";
import { EmailService } from "../../../src/services/emailService";

export const runtime = "nodejs";

export async function GET() {
    try {
        // Get email provider from environment
        const provider = process.env.EMAIL_PROVIDER || "brevo";

        // Create email service configuration
        let emailConfig;
        if (provider === "brevo") {
            emailConfig = {
                provider: "brevo" as const,
                brevo: {
                    apiKey: process.env.BREVO_KEY || "",
                    senderEmail: process.env.BREVO_MAIL || "",
                },
            };
        } else if (provider === "resend") {
            emailConfig = {
                provider: "resend" as const,
                resend: {
                    apiKey: process.env.RESEND_API_KEY || "",
                },
            };
        } else {
            return NextResponse.json({
                status: "error",
                timestamp: new Date().toISOString(),
                services: {
                    email: "not configured",
                },
                error: "Invalid email provider",
            });
        }

        // Initialize email service and verify connection
        const emailService = new EmailService(emailConfig);
        const emailConnected = await emailService.verifyConnection();

        return NextResponse.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            services: {
                email: emailConnected ? "connected" : "disconnected",
                provider: provider,
            },
        });
    } catch (error) {
        console.error("Health check error:", error);
        return NextResponse.json(
            {
                status: "error",
                timestamp: new Date().toISOString(),
                services: {
                    email: "error",
                },
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
