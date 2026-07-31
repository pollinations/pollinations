import { type NextRequest, NextResponse } from "next/server";
import { MicroService } from "../../../../src/services/microService";
import { emailConfigFromEnvironment } from "../config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { to, userName, serviceName = "Pollinations AI" } = body;

        if (!to || !userName) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: to, userName",
                },
                { status: 400 },
            );
        }

        const emailConfig = emailConfigFromEnvironment();
        if (typeof emailConfig === "string") {
            return NextResponse.json(
                { success: false, error: emailConfig },
                { status: 400 },
            );
        }

        // Initialize micro service
        const microService = new MicroService(emailConfig);

        // Send welcome email
        const result = await microService.sendWelcomeEmail(
            to,
            userName,
            serviceName,
        );

        if (result.success) {
            return NextResponse.json({
                success: true,
                messageId: result.messageId,
                message: "Welcome email sent successfully",
            });
        } else {
            return NextResponse.json(
                {
                    success: false,
                    error: result.error,
                    message: "Failed to send welcome email",
                },
                { status: 400 },
            );
        }
    } catch (error) {
        console.error("Welcome email error:", error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
                message: "Failed to send welcome email",
            },
            { status: 500 },
        );
    }
}
