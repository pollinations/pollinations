import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { Button } from "../components/button.tsx";

const SCOPE_LABELS: Record<string, string> = {
    openid: "Know who you are",
    profile: "Read your profile (name, picture)",
    email: "Read your email address",
    generate: "Generate images, text, audio, and video",
    "read:usage": "View your usage history",
    "read:balance": "View your pollen balance",
    offline_access: "Stay connected when you're away",
};

export const Route = createFileRoute("/device")({
    component: DeviceComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        user_code: (search.user_code as string) || "",
    }),
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (!result.data?.user) throw redirect({ to: "/sign-in" });
    },
});

type DeviceStatus = "pending" | "approved" | "denied" | "expired";

function DeviceComponent() {
    const { user_code: prefilled } = Route.useSearch();
    const { data: session } = authClient.useSession();
    const user = session?.user;

    const [userCode, setUserCode] = useState(prefilled);
    const [status, setStatus] = useState<DeviceStatus | null>(null);
    const [scope, setScope] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    // Verify user code on mount if pre-filled
    useEffect(() => {
        if (prefilled) verifyCode(prefilled);
    }, [prefilled]);

    async function verifyCode(code: string) {
        setError(null);
        try {
            const res = await authClient.deviceAuthorization.device({
                query: { user_code: code },
            });
            if ("error" in res && res.error) {
                setError(res.error.message || "Invalid code");
                return;
            }
            if (res.data) {
                setStatus(res.data.status as DeviceStatus);
                // scope comes from the device code record
                if ("scope" in res.data && typeof res.data.scope === "string") {
                    setScope(res.data.scope.split(" ").filter(Boolean));
                }
            }
        } catch {
            setError("Failed to verify code");
        }
    }

    async function handleSubmitCode(e: React.FormEvent) {
        e.preventDefault();
        if (!userCode.trim()) return;
        await verifyCode(userCode.trim().toUpperCase());
    }

    async function handleApprove() {
        setSubmitting(true);
        setError(null);
        try {
            const res = await authClient.deviceAuthorization.approve({
                userCode: userCode.trim().toUpperCase(),
            });
            if ("error" in res && res.error) {
                setError(res.error.message || "Approval failed");
                setSubmitting(false);
                return;
            }
            setDone(true);
        } catch {
            setError("Approval failed");
            setSubmitting(false);
        }
    }

    async function handleDeny() {
        setSubmitting(true);
        setError(null);
        try {
            await authClient.deviceAuthorization.deny({
                userCode: userCode.trim().toUpperCase(),
            });
            setDone(true);
            setStatus("denied");
        } catch {
            setError("Denial failed");
            setSubmitting(false);
        }
    }

    if (done) {
        return (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
                <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg p-8 text-center max-w-lg w-full">
                    <div className="text-4xl mb-4">
                        {status === "denied" ? "🚫" : "✅"}
                    </div>
                    <h2 className="text-lg font-semibold text-green-950 mb-2">
                        {status === "denied"
                            ? "Access Denied"
                            : "Device Authorized"}
                    </h2>
                    <p className="text-sm text-green-800">
                        You can close this tab and return to your device.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden bg-green-950/50">
            <div className="bg-green-100 border-4 border-green-950 rounded-lg shadow-lg max-h-[85vh] max-w-lg w-full flex flex-col">
                {/* Header */}
                <div className="shrink-0 p-6 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            Authorize Device
                        </h2>
                        <img
                            src="/logo_text_black.svg"
                            alt="pollinations.ai"
                            className="h-8 object-contain invert"
                        />
                    </div>
                    {user && (
                        <p className="text-sm text-green-800 mt-1">
                            Signed in as{" "}
                            <strong>
                                {user.githubUsername || user.email}
                            </strong>
                        </p>
                    )}
                </div>

                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto px-6 py-2 space-y-4"
                    style={{
                        scrollbarWidth: "thin",
                        overscrollBehavior: "contain",
                    }}
                >
                    {error && (
                        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    )}

                    {!status ? (
                        /* Step 1: Enter code */
                        <form onSubmit={handleSubmitCode} className="space-y-4">
                            <p className="text-sm text-green-900">
                                Enter the code shown on your device:
                            </p>
                            <input
                                type="text"
                                value={userCode}
                                onChange={(e) =>
                                    setUserCode(e.target.value.toUpperCase())
                                }
                                placeholder="XXXX-XXXX"
                                className="w-full text-center text-2xl font-mono tracking-widest p-3 border-2 border-green-300 rounded-lg bg-white text-green-950 focus:border-green-600 focus:outline-none"
                                autoFocus
                                maxLength={20}
                            />
                            <Button
                                as="button"
                                type="submit"
                                color="green"
                                className="w-full"
                            >
                                Continue
                            </Button>
                        </form>
                    ) : status === "pending" ? (
                        /* Step 2: Approve/Deny */
                        <>
                            <div className="bg-green-200 rounded-lg p-4">
                                <p className="text-sm text-green-950 font-medium">
                                    A device is requesting access to your
                                    account
                                </p>
                                <p className="text-xs text-green-800 mt-1 font-mono">
                                    Code: {userCode}
                                </p>
                            </div>

                            {scope.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-green-950 mb-2">
                                        This will allow the device to:
                                    </p>
                                    <ul className="text-sm text-green-900 space-y-2">
                                        {scope.map((s) => (
                                            <li
                                                key={s}
                                                className="flex items-start gap-2"
                                            >
                                                <span className="text-green-600">
                                                    &#x2713;
                                                </span>
                                                <span>
                                                    {SCOPE_LABELS[s] || s}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                            <p className="text-yellow-800 text-sm">
                                This code has already been{" "}
                                {status === "expired" ? "expired" : "used"}.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {status === "pending" && (
                    <div className="flex items-center justify-between p-6 pt-4 shrink-0">
                        <a
                            href="/terms"
                            className="text-xs text-green-700 hover:text-green-950 hover:underline"
                        >
                            Terms & Conditions
                        </a>
                        <div className="flex gap-2">
                            <Button
                                as="button"
                                onClick={handleDeny}
                                disabled={submitting}
                                weight="outline"
                            >
                                Deny
                            </Button>
                            <Button
                                as="button"
                                onClick={handleApprove}
                                disabled={submitting}
                                color="green"
                            >
                                {submitting ? "Authorizing..." : "Allow"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
