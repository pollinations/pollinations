/**
 * Provider Comparison Example
 *
 * This example shows how to use both Brevo and Resend providers
 * and compares their usage patterns.
 */

import { createMicroServiceWrapper } from "../src/wrapper.js";

// Initialize Brevo service
const brevoService = createMicroServiceWrapper({
    provider: "brevo",
    brevo: {
        apiKey: process.env.BREVO_KEY || "your-brevo-api-key",
        senderEmail: process.env.BREVO_MAIL || "your-sender-email@domain.com",
    },
});

// Initialize Resend service
const resendService = createMicroServiceWrapper({
    provider: "resend",
    resend: {
        apiKey: process.env.RESEND_API_KEY || "your-resend-api-key",
    },
});

// Example: Send the same email via both providers
async function sendViaBothProviders() {
    const emailData = {
        to: "user@example.com",
        subject: "Provider Comparison Test",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Provider Comparison</h1>
        <p>This email was sent to test both Brevo and Resend providers.</p>
        <p>Both providers should deliver this email successfully!</p>
        <p>Best regards,<br>The Pollinations AI Team</p>
      </div>
    `,
    };

    console.log("📧 Sending email via both providers...\n");

    // Send via Brevo
    try {
        console.log("🟦 Sending via Brevo...");
        const brevoResult = await brevoService.sendMail(emailData);

        if (brevoResult.success) {
            console.log(
                "✅ Brevo: Email sent successfully!",
                brevoResult.messageId,
            );
        } else {
            console.error("❌ Brevo: Failed to send email:", brevoResult.error);
        }
    } catch (error) {
        console.error("❌ Brevo Error:", error.message);
    }

    console.log("");

    // Send via Resend
    try {
        console.log("🟨 Sending via Resend...");
        const resendResult = await resendService.sendMail(emailData);

        if (resendResult.success) {
            console.log(
                "✅ Resend: Email sent successfully!",
                resendResult.messageId,
            );
        } else {
            console.error(
                "❌ Resend: Failed to send email:",
                resendResult.error,
            );
        }
    } catch (error) {
        console.error("❌ Resend Error:", error.message);
    }
}

// Example: Compare provider features
async function compareProviderFeatures() {
    console.log("🔍 Comparing Provider Features:\n");

    console.log("📊 Brevo Features:");
    console.log("  ✅ REST API (fetch-based)");
    console.log("  ✅ Requires sender email configuration");
    console.log("  ✅ Supports CC/BCC");
    console.log("  ✅ Supports reply-to");
    console.log("  ✅ Free tier available");
    console.log("  ✅ Good for transactional emails");
    console.log("  ✅ European-based (GDPR compliant)");

    console.log("\n📊 Resend Features:");
    console.log("  ✅ Modern SDK");
    console.log("  ✅ No sender email required (uses domain)");
    console.log("  ✅ Supports CC/BCC");
    console.log("  ✅ Supports attachments");
    console.log("  ✅ Free tier available");
    console.log("  ✅ Great developer experience");
    console.log("  ✅ Built for developers");

    console.log("\n🎯 When to use which:");
    console.log("  🟦 Use Brevo when:");
    console.log("    - You need GDPR compliance");
    console.log("    - You prefer REST API over SDK");
    console.log("    - You want more control over sender configuration");
    console.log("    - You need European data residency");

    console.log("\n  🟨 Use Resend when:");
    console.log("    - You want the best developer experience");
    console.log("    - You need attachment support");
    console.log("    - You prefer modern SDKs");
    console.log("    - You want simple setup");
}

// Example: Verify both connections
async function verifyBothConnections() {
    console.log("🔍 Verifying both provider connections...\n");

    // Verify Brevo
    try {
        const brevoConnected = await brevoService.verifyConnection();
        console.log(
            brevoConnected ? "✅ Brevo: Connected" : "❌ Brevo: Not connected",
        );
    } catch (error) {
        console.log("❌ Brevo: Connection error:", error.message);
    }

    // Verify Resend
    try {
        const resendConnected = await resendService.verifyConnection();
        console.log(
            resendConnected
                ? "✅ Resend: Connected"
                : "❌ Resend: Not connected",
        );
    } catch (error) {
        console.log("❌ Resend: Connection error:", error.message);
    }
}

// Run all examples
async function runComparison() {
    console.log("🚀 Email Provider Comparison Examples\n");

    await verifyBothConnections();
    console.log("");

    await compareProviderFeatures();
    console.log("");

    await sendViaBothProviders();
    console.log("");

    console.log("✨ Comparison completed!");
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runComparison().catch(console.error);
}

export {
    brevoService,
    resendService,
    sendViaBothProviders,
    compareProviderFeatures,
    verifyBothConnections,
};
