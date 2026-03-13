import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/callback")({
    component: CallbackPage,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            code: search.code as string | undefined,
            error: search.error as string | undefined,
            error_description: search.error_description as string | undefined,
            state: search.state as string | undefined,
        };
    },
});

function CallbackPage() {
    const { code, error, error_description, state } = Route.useSearch();
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "success" | "error">(
        "loading",
    );
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (error) {
            setStatus("error");
            setMessage(
                `Authorization failed: ${error}\n${error_description || ""}`,
            );
            return;
        }

        if (code) {
            setStatus("success");
            setMessage(
                `Authorization successful!\n\nCode: ${code}\nState: ${state || "none"}\n\nThis code can now be exchanged for tokens.`,
            );
            return;
        }

        setStatus("error");
        setMessage("No authorization code or error received.");
    }, [code, error, error_description, state]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                <h1 className="text-2xl font-bold mb-4">
                    {status === "loading" && "🔄 Processing..."}
                    {status === "success" && "✅ Authorization Successful"}
                    {status === "error" && "❌ Authorization Failed"}
                </h1>
                <pre className="bg-gray-100 p-4 rounded-lg text-sm whitespace-pre-wrap break-all">
                    {message}
                </pre>
                <button
                    type="button"
                    onClick={() => navigate({ to: "/" })}
                    className="mt-4 w-full bg-amber-500 text-white py-2 px-4 rounded-lg hover:bg-amber-600 transition-colors"
                >
                    Go to Dashboard
                </button>
            </div>
        </div>
    );
}
