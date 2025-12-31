/**
 * Next.js API Example
 *
 * This example shows how to use the Next.js API endpoints
 * for sending emails.
 */

const API_BASE_URL = "http://localhost:3000/api";

// Example 1: Health check
async function checkHealth() {
    try {
        console.log("🔍 Checking service health...");

        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();

        console.log("✅ Health check result:", data);
    } catch (error) {
        console.error("❌ Health check failed:", error.message);
    }
}

// Example 2: Send custom email
async function sendCustomEmail() {
    try {
        console.log("📧 Sending custom email...");

        const response = await fetch(`${API_BASE_URL}/email/send`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to: "user@example.com",
                subject: "Hello from Next.js API!",
                html: "<h1>Hello World!</h1><p>This email was sent using the Next.js API.</p>",
            }),
        });

        const data = await response.json();

        if (data.success) {
            console.log("✅ Email sent successfully!", data.messageId);
        } else {
            console.error("❌ Failed to send email:", data.error);
        }
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

// Example 3: Send welcome email
async function sendWelcomeEmail() {
    try {
        console.log("📧 Sending welcome email...");

        const response = await fetch(`${API_BASE_URL}/email/welcome`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to: "newuser@example.com",
                userName: "John Doe",
                serviceName: "Pollinations AI",
            }),
        });

        const data = await response.json();

        if (data.success) {
            console.log("✅ Welcome email sent successfully!", data.messageId);
        } else {
            console.error("❌ Failed to send welcome email:", data.error);
        }
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

// Example 4: Send to multiple recipients
async function sendBulkEmail() {
    try {
        console.log("📧 Sending bulk email...");

        const response = await fetch(`${API_BASE_URL}/email/send`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to: [
                    "user1@example.com",
                    "user2@example.com",
                    "user3@example.com",
                ],
                subject: "Important Update",
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Important Update</h1>
            <p>Dear valued user,</p>
            <p>We have an important update regarding our service.</p>
            <p>Best regards,<br>The Pollinations AI Team</p>
          </div>
        `,
            }),
        });

        const data = await response.json();

        if (data.success) {
            console.log("✅ Bulk email sent successfully!", data.messageId);
        } else {
            console.error("❌ Failed to send bulk email:", data.error);
        }
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

// Example 5: Test with different providers
async function testProviders() {
    console.log("🔄 Testing different email providers...\n");

    // Test Brevo (if configured)
    console.log("🟦 Testing Brevo...");
    await sendCustomEmail();

    console.log("\n🟨 Testing Resend...");
    // Note: You would need to change EMAIL_PROVIDER=resend in your .env
    await sendCustomEmail();
}

// Run all examples
async function runExamples() {
    console.log("🚀 Next.js Email API Examples\n");

    await checkHealth();
    console.log("");

    await sendCustomEmail();
    console.log("");

    await sendWelcomeEmail();
    console.log("");

    await sendBulkEmail();
    console.log("");

    await testProviders();
    console.log("");

    console.log("✨ All examples completed!");
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runExamples().catch(console.error);
}

export {
    checkHealth,
    sendCustomEmail,
    sendWelcomeEmail,
    sendBulkEmail,
    testProviders,
};
