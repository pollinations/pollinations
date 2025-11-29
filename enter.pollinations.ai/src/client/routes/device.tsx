import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/device")({
    component: DeviceVerification,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            code: search.code as string | undefined,
        };
    },
    beforeLoad: async ({ context }) => {
        const result = await context.auth.getSession();
        return {
            user: result.data?.user || null,
        };
    },
});

function DeviceVerification() {
    const { code } = Route.useSearch() as { code?: string };
    const [userCode, setUserCode] = useState(code || "");
    const [status, setStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [message, setMessage] = useState("");
    const { user } = Route.useRouteContext();

    const handleSubmit = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            setStatus("loading");

            try {
                // Format code: remove dashes and spaces
                const formattedCode = userCode
                    .replace(/[-\s]/g, "")
                    .toUpperCase();

                // Approve the device directly - it validates the code internally
                const approveRes = await fetch("/api/auth/device/approve", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        userCode: formattedCode,
                    }),
                });

                const approveData = (await approveRes.json()) as Record<
                    string,
                    unknown
                >;

                if (!approveRes.ok) {
                    if (approveRes.status === 401) {
                        throw new Error("Please sign in to verify device");
                    }
                    throw new Error(
                        (approveData.error_description ||
                            approveData.message ||
                            approveData.error ||
                            "Invalid or expired code") as string,
                    );
                }

                setStatus("success");
                setMessage("Device approved! You can now close this window.");
            } catch (err) {
                setStatus("error");
                setMessage(err instanceof Error ? err.message : String(err));
            }
        },
        [userCode],
    );

    useEffect(() => {
        if (code && status === "idle" && user) {
            handleSubmit();
        }
    }, [code, user, status, handleSubmit]);

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
                <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
                    <h1 className="text-2xl font-bold mb-4">
                        Device Verification
                    </h1>
                    <p className="mb-6 text-gray-600">
                        You need to be signed in to verify a device.
                    </p>
                    <a
                        href={`/sign-in?redirect=${encodeURIComponent(window.location.href)}`}
                        className="inline-block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Sign In
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-2xl font-bold mb-6 text-center">
                    Device Verification
                </h1>

                {status === "success" ? (
                    <div className="text-green-600 text-center p-4 bg-green-50 rounded">
                        {message}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label
                                htmlFor="code"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Enter Code
                            </label>
                            <input
                                type="text"
                                id="code"
                                value={userCode}
                                onChange={(e) =>
                                    setUserCode(e.target.value.toUpperCase())
                                }
                                placeholder="XXXX-XXXX"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                required
                            />
                        </div>

                        {status === "error" && (
                            <div className="text-red-600 text-sm p-2 bg-red-50 rounded border border-red-200">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={status === "loading"}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {status === "loading"
                                ? "Verifying..."
                                : "Verify Device"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
