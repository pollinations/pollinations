"use client";

import { useState } from "react";

export default function Home() {
    const [activeTab, setActiveTab] = useState("docs");
    const [testResults, setTestResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [emailProvider, _setEmailProvider] = useState("brevo");
    const [testEmail, setTestEmail] = useState("test@example.com");
    const [testSubject, setTestSubject] = useState(
        "Test Email from Micro Service",
    );
    const [testMessage, setTestMessage] = useState(
        "<h1>Hello World!</h1><p>This is a test email from the micro service.</p>",
    );

    const testAPI = async (endpoint: string, method: string, body?: any) => {
        setLoading(true);
        setTestResults(null);

        try {
            const response = await fetch(`/api${endpoint}`, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            const data = await response.json();
            setTestResults({
                endpoint,
                method,
                status: response.status,
                data,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            setTestResults({
                endpoint,
                method,
                status: "error",
                data: {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                },
                timestamp: new Date().toISOString(),
            });
        } finally {
            setLoading(false);
        }
    };

    const testHealth = () => testAPI("/health", "GET");

    const testSendEmail = () =>
        testAPI("/email/send", "POST", {
            to: testEmail,
            subject: testSubject,
            html: testMessage,
        });

    const testWelcomeEmail = () =>
        testAPI("/email/welcome", "POST", {
            to: testEmail,
            userName: "John Doe",
            serviceName: "Pollinations AI",
        });

    return (
        <div
            style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                maxWidth: "1000px",
                margin: "0 auto",
                padding: "2rem",
                backgroundColor: "#ffffff",
                minHeight: "100vh",
            }}
        >
            <h1 style={{ color: "#1a1a1a", marginBottom: "0.5rem" }}>
                🚀 Micro.pollinations.ai
            </h1>
            <p style={{ color: "#666666", marginBottom: "2rem" }}>
                A microservice for mailer utilities and other microservices.
            </p>

            {/* Tabs */}
            <div
                style={{
                    display: "flex",
                    borderBottom: "1px solid #e5e5e5",
                    marginBottom: "2rem",
                }}
            >
                <button
                    onClick={() => setActiveTab("docs")}
                    style={{
                        padding: "1rem 2rem",
                        border: "none",
                        background:
                            activeTab === "docs" ? "#1a1a1a" : "transparent",
                        color: activeTab === "docs" ? "white" : "#666666",
                        cursor: "pointer",
                        borderTopLeftRadius: "6px",
                        borderTopRightRadius: "6px",
                        fontWeight: "500",
                        fontSize: "0.95rem",
                        transition: "all 0.2s ease",
                    }}
                >
                    📚 Documentation
                </button>
                <button
                    onClick={() => setActiveTab("test")}
                    style={{
                        padding: "1rem 2rem",
                        border: "none",
                        background:
                            activeTab === "test" ? "#1a1a1a" : "transparent",
                        color: activeTab === "test" ? "white" : "#666666",
                        cursor: "pointer",
                        borderTopLeftRadius: "6px",
                        borderTopRightRadius: "6px",
                        fontWeight: "500",
                        fontSize: "0.95rem",
                        transition: "all 0.2s ease",
                    }}
                >
                    🧪 API Tester
                </button>
            </div>

            {activeTab === "docs" && (
                <div>
                    <h2 style={{ color: "#1a1a1a", marginBottom: "1rem" }}>
                        📧 Email Service
                    </h2>
                    <p style={{ color: "#666666", marginBottom: "2rem" }}>
                        Send emails via Brevo or Resend with a simple API.
                    </p>

                    <h3 style={{ color: "#1a1a1a", marginBottom: "1rem" }}>
                        Available Endpoints:
                    </h3>
                    <ul style={{ color: "#666666", marginBottom: "2rem" }}>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                GET /api/health
                            </code>{" "}
                            - Health check
                        </li>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                POST /api/email/send
                            </code>{" "}
                            - Send custom email
                        </li>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                POST /api/email/welcome
                            </code>{" "}
                            - Send welcome email
                        </li>
                    </ul>

                    <h3 style={{ color: "#1a1a1a", marginBottom: "1rem" }}>
                        Example Usage:
                    </h3>
                    <pre
                        style={{
                            backgroundColor: "#f8f9fa",
                            padding: "1.5rem",
                            borderRadius: "6px",
                            overflow: "auto",
                            border: "1px solid #e5e5e5",
                            fontSize: "0.9rem",
                            color: "#1a1a1a",
                        }}
                    >
                        {`curl -X POST http://localhost:3000/api/email/send \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "user@example.com",
    "subject": "Hello World",
    "html": "<h1>Hello from Micro Service!</h1>"
  }'`}
                    </pre>

                    <h3
                        style={{
                            color: "#1a1a1a",
                            marginBottom: "1rem",
                            marginTop: "2rem",
                        }}
                    >
                        Configuration:
                    </h3>
                    <p style={{ color: "#666666", marginBottom: "1rem" }}>
                        Set your environment variables:
                    </p>
                    <ul style={{ color: "#666666" }}>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                EMAIL_PROVIDER
                            </code>{" "}
                            - "brevo" or "resend"
                        </li>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                BREVO_KEY
                            </code>{" "}
                            - Your Brevo API key
                        </li>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                BREVO_MAIL
                            </code>{" "}
                            - Your sender email
                        </li>
                        <li>
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.9rem",
                                }}
                            >
                                RESEND_API_KEY
                            </code>{" "}
                            - Your Resend API key
                        </li>
                    </ul>
                </div>
            )}

            {activeTab === "test" && (
                <div>
                    <h2 style={{ color: "#1a1a1a", marginBottom: "2rem" }}>
                        🧪 API Testing Interface
                    </h2>

                    {/* Provider Selection */}
                    <div
                        style={{
                            backgroundColor: "#ffffff",
                            padding: "1.5rem",
                            borderRadius: "8px",
                            marginBottom: "2rem",
                            border: "1px solid #e5e5e5",
                        }}
                    >
                        <h3 style={{ color: "#1a1a1a", marginBottom: "1rem" }}>
                            📧 Email Provider
                        </h3>
                        <p style={{ color: "#666666", marginBottom: "0.5rem" }}>
                            Current provider:{" "}
                            <strong style={{ color: "#1a1a1a" }}>
                                {emailProvider}
                            </strong>
                        </p>
                        <p style={{ fontSize: "0.9rem", color: "#999999" }}>
                            To change provider, update the{" "}
                            <code
                                style={{
                                    backgroundColor: "#f8f9fa",
                                    padding: "0.2rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.85rem",
                                }}
                            >
                                EMAIL_PROVIDER
                            </code>{" "}
                            environment variable and restart the server.
                        </p>
                    </div>

                    {/* Test Email Form */}
                    <div
                        style={{
                            backgroundColor: "#ffffff",
                            padding: "1.5rem",
                            borderRadius: "8px",
                            marginBottom: "2rem",
                            border: "1px solid #e5e5e5",
                        }}
                    >
                        <h3
                            style={{ color: "#1a1a1a", marginBottom: "1.5rem" }}
                        >
                            📝 Test Email Configuration
                        </h3>
                        <div style={{ marginBottom: "1.5rem" }}>
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "0.5rem",
                                    fontWeight: "500",
                                    color: "#1a1a1a",
                                }}
                            >
                                To Email:
                            </label>
                            <input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    border: "1px solid #e5e5e5",
                                    borderRadius: "6px",
                                    fontSize: "1rem",
                                    color: "#1a1a1a",
                                    backgroundColor: "#ffffff",
                                    transition: "border-color 0.2s ease",
                                }}
                                placeholder="test@example.com"
                            />
                        </div>
                        <div style={{ marginBottom: "1.5rem" }}>
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "0.5rem",
                                    fontWeight: "500",
                                    color: "#1a1a1a",
                                }}
                            >
                                Subject:
                            </label>
                            <input
                                type="text"
                                value={testSubject}
                                onChange={(e) => setTestSubject(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    border: "1px solid #e5e5e5",
                                    borderRadius: "6px",
                                    fontSize: "1rem",
                                    color: "#1a1a1a",
                                    backgroundColor: "#ffffff",
                                    transition: "border-color 0.2s ease",
                                }}
                                placeholder="Test Email Subject"
                            />
                        </div>
                        <div style={{ marginBottom: "1rem" }}>
                            <label
                                style={{
                                    display: "block",
                                    marginBottom: "0.5rem",
                                    fontWeight: "500",
                                    color: "#1a1a1a",
                                }}
                            >
                                HTML Message:
                            </label>
                            <textarea
                                value={testMessage}
                                onChange={(e) => setTestMessage(e.target.value)}
                                rows={4}
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    border: "1px solid #e5e5e5",
                                    borderRadius: "6px",
                                    fontSize: "0.9rem",
                                    fontFamily: "Monaco, Consolas, monospace",
                                    color: "#1a1a1a",
                                    backgroundColor: "#ffffff",
                                    transition: "border-color 0.2s ease",
                                }}
                                placeholder="<h1>Hello World!</h1><p>Your message here...</p>"
                            />
                        </div>
                    </div>

                    {/* Test Buttons */}
                    <div
                        style={{
                            display: "flex",
                            gap: "1rem",
                            marginBottom: "2rem",
                            flexWrap: "wrap",
                        }}
                    >
                        <button
                            onClick={testHealth}
                            disabled={loading}
                            style={{
                                padding: "0.75rem 1.5rem",
                                backgroundColor: "#1a1a1a",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: "0.95rem",
                                fontWeight: "500",
                                opacity: loading ? 0.6 : 1,
                                transition: "all 0.2s ease",
                            }}
                        >
                            {loading ? "⏳ Testing..." : "🔍 Test Health"}
                        </button>
                        <button
                            onClick={testSendEmail}
                            disabled={loading}
                            style={{
                                padding: "0.75rem 1.5rem",
                                backgroundColor: "#1a1a1a",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: "0.95rem",
                                fontWeight: "500",
                                opacity: loading ? 0.6 : 1,
                                transition: "all 0.2s ease",
                            }}
                        >
                            {loading ? "⏳ Sending..." : "📧 Send Test Email"}
                        </button>
                        <button
                            onClick={testWelcomeEmail}
                            disabled={loading}
                            style={{
                                padding: "0.75rem 1.5rem",
                                backgroundColor: "#1a1a1a",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: "0.95rem",
                                fontWeight: "500",
                                opacity: loading ? 0.6 : 1,
                                transition: "all 0.2s ease",
                            }}
                        >
                            {loading
                                ? "⏳ Sending..."
                                : "👋 Send Welcome Email"}
                        </button>
                    </div>

                    {/* Results */}
                    {testResults && (
                        <div
                            style={{
                                backgroundColor:
                                    testResults.status === 200 ||
                                    testResults.status === "ok"
                                        ? "#f0f9ff"
                                        : "#fef2f2",
                                border: `1px solid ${testResults.status === 200 || testResults.status === "ok" ? "#e0f2fe" : "#fecaca"}`,
                                padding: "1.5rem",
                                borderRadius: "8px",
                                marginTop: "1rem",
                            }}
                        >
                            <h3
                                style={{
                                    color:
                                        testResults.status === 200 ||
                                        testResults.status === "ok"
                                            ? "#1a1a1a"
                                            : "#dc2626",
                                    marginTop: 0,
                                    marginBottom: "1rem",
                                }}
                            >
                                {testResults.status === 200 ||
                                testResults.status === "ok"
                                    ? "✅ Success"
                                    : "❌ Error"}
                            </h3>
                            <p
                                style={{
                                    color: "#666666",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                <strong>Endpoint:</strong> {testResults.method}{" "}
                                {testResults.endpoint}
                            </p>
                            <p
                                style={{
                                    color: "#666666",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                <strong>Status:</strong> {testResults.status}
                            </p>
                            <p
                                style={{
                                    color: "#666666",
                                    marginBottom: "1rem",
                                }}
                            >
                                <strong>Time:</strong> {testResults.timestamp}
                            </p>
                            <pre
                                style={{
                                    backgroundColor: "#ffffff",
                                    padding: "1rem",
                                    borderRadius: "6px",
                                    overflow: "auto",
                                    fontSize: "0.85rem",
                                    marginTop: "1rem",
                                    border: "1px solid #e5e5e5",
                                    color: "#1a1a1a",
                                    fontFamily: "Monaco, Consolas, monospace",
                                }}
                            >
                                {JSON.stringify(testResults.data, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            <p
                style={{
                    marginTop: "3rem",
                    color: "#999999",
                    fontSize: "0.9rem",
                    textAlign: "center",
                }}
            >
                Built with Next.js and TypeScript
            </p>
        </div>
    );
}
