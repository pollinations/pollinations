import { type NextRequest, NextResponse } from "next/server";
import { EmailService } from "../../../../src/services/emailService";
import { EmailMessageSchema } from "../../../../src/types/email";
import { emailConfigFromEnvironment } from "../config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate the request body
        const validatedData = EmailMessageSchema.parse(body);

        const emailConfig = emailConfigFromEnvironment();
        if (typeof emailConfig === "string") {
            return NextResponse.json(
                { success: false, error: emailConfig },
                { status: 400 },
            );
        }

        // Initialize email service
        const emailService = new EmailService(emailConfig);

        // Send email
        const result = await emailService.sendMail(validatedData);

        if (result.success) {
            return NextResponse.json({
                success: true,
                messageId: result.messageId,
                message: "Email sent successfully",
            });
        } else {
            return NextResponse.json(
                {
                    success: false,
                    error: result.error,
                    message: "Failed to send email",
                },
                { status: 400 },
            );
        }
    } catch (error) {
        console.error("Email send error:", error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
                message: "Failed to send email",
            },
            { status: 500 },
        );
    }
}
