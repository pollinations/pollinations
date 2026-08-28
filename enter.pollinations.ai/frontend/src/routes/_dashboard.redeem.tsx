import {
    Alert,
    Button,
    CheckIcon,
    Input,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import {
    createFileRoute,
    useNavigate,
    useRouter,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { apiClient } from "../api.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

const PENDING_GIFT_CODE_KEY = "pending_pollen_gift_code";

export const Route = createFileRoute("/_dashboard/redeem")({
    component: RedeemPollenPage,
});

type RedemptionResult = {
    pollenAdded: number;
    newBalance: number;
};

function loadPendingCode(): string {
    try {
        return sessionStorage.getItem(PENDING_GIFT_CODE_KEY) ?? "";
    } catch {
        return "";
    }
}

function savePendingCode(code: string): void {
    try {
        if (code) {
            sessionStorage.setItem(PENDING_GIFT_CODE_KEY, code);
        } else {
            sessionStorage.removeItem(PENDING_GIFT_CODE_KEY);
        }
    } catch {
        // Redemption still works if browser storage is unavailable.
    }
}

function responseError(payload: unknown, fallback: string): string {
    if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
    ) {
        return payload.error;
    }
    return fallback;
}

function RedeemPollenPage() {
    const { user } = DashboardRoute.useLoaderData();
    const navigate = useNavigate({ from: "/redeem" });
    const router = useRouter();
    const [code, setCode] = useState(loadPendingCode);
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<RedemptionResult | null>(null);
    const normalizedCode = code.trim().toUpperCase();

    function updateCode(value: string): void {
        const nextCode = value.toUpperCase();
        setCode(nextCode);
        savePendingCode(nextCode);
        setError(null);
        setResult(null);
    }

    async function redeemCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!user || !normalizedCode || isRedeeming) return;

        setIsRedeeming(true);
        setError(null);

        try {
            const response = await apiClient["pollen-gifts"].redeem.$post({
                json: { code: normalizedCode },
            });
            const payload = (await response
                .json()
                .catch(() => null)) as unknown;

            if (!response.ok) {
                setError(
                    responseError(
                        payload,
                        "This gift code could not be redeemed.",
                    ),
                );
                return;
            }

            if (
                !payload ||
                typeof payload !== "object" ||
                !("redeemed" in payload) ||
                payload.redeemed !== true ||
                !("pollenAdded" in payload) ||
                typeof payload.pollenAdded !== "number" ||
                !("newBalance" in payload) ||
                typeof payload.newBalance !== "number"
            ) {
                setError(
                    "The gift was redeemed, but its balance was unavailable.",
                );
                return;
            }

            setResult({
                pollenAdded: payload.pollenAdded,
                newBalance: payload.newBalance,
            });
            setCode("");
            savePendingCode("");
            await router.invalidate().catch(() => undefined);
        } catch {
            setError("This gift code could not be redeemed. Please try again.");
        } finally {
            setIsRedeeming(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Redeem Pollen"
                intro="Enter a single-use gift code to add its Pollen to your paid balance."
                framed
            >
                <form onSubmit={redeemCode} className="flex flex-col gap-4">
                    <Surface className="space-y-4">
                        <label className="block" htmlFor="pollen-gift-code">
                            <span className="mb-1.5 block text-sm font-semibold text-theme-text-strong">
                                Gift code
                            </span>
                            <Input
                                id="pollen-gift-code"
                                type="text"
                                value={code}
                                onChange={(event) =>
                                    updateCode(event.currentTarget.value)
                                }
                                placeholder="POLLEN-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                maxLength={64}
                                disabled={isRedeeming}
                                className="w-full border-2 border-theme-border bg-surface-white p-3 text-center font-mono text-xl tracking-widest text-theme-text-strong sm:text-2xl"
                            />
                        </label>

                        {!user ? (
                            <div className="flex flex-col gap-3 border-t border-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <Text size="sm" tone="muted">
                                    Sign in to add this gift to your
                                    Pollinations wallet. Your code stays in this
                                    browser while you sign in.
                                </Text>
                                <div data-theme="accent" className="shrink-0">
                                    <Button
                                        type="button"
                                        size="lg"
                                        onClick={() =>
                                            void navigate({
                                                to: "/sign-in",
                                                search: { next: "/redeem" },
                                            })
                                        }
                                    >
                                        Sign in to redeem
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-end border-t border-divider pt-4">
                                <div data-theme="accent">
                                    <Button
                                        type="submit"
                                        size="lg"
                                        disabled={
                                            !normalizedCode || isRedeeming
                                        }
                                        className="min-w-40"
                                    >
                                        {isRedeeming
                                            ? "Redeeming..."
                                            : "Redeem gift code"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Surface>

                    {error && <Alert intent="danger">{error}</Alert>}
                    {result && (
                        <Alert title="Gift redeemed">
                            <span className="inline-flex items-center gap-2">
                                <CheckIcon className="h-4 w-4 shrink-0" />
                                <span>
                                    {formatPollen(result.pollenAdded)} Pollen
                                    was added to your paid balance. Your new
                                    paid balance is{" "}
                                    <strong>
                                        {formatPollen(result.newBalance)}
                                    </strong>
                                    .
                                </span>
                            </span>
                        </Alert>
                    )}
                </form>
            </Section>
        </div>
    );
}
