import { Button, Input } from "@pollinations/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { accountClient } from "../../api.ts";

const REDEEM_FAILED = "Couldn’t claim the code. Please try again.";

/** Promo and event codes arrive as a `?code=` link or are typed in. */
export function RedeemCode({ onRedeemed }: { onRedeemed: () => void }) {
    const [code, setCode] = useState(
        () => new URLSearchParams(window.location.search).get("code") ?? "",
    );
    const [error, setError] = useState<string | null>(null);
    const [redeeming, setRedeeming] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // A `?code=` link opens the page with the code filled in; bring it into view.
    useEffect(() => {
        if (!new URLSearchParams(window.location.search).has("code")) return;
        inputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        inputRef.current?.focus({ preventScroll: true });
    }, []);

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setRedeeming(true);
        setError(null);
        try {
            const response = await accountClient["promo-codes"].redeem.$post({
                json: { code },
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as {
                    error?: { message?: string };
                } | null;
                setError(body?.error?.message ?? REDEEM_FAILED);
                return;
            }
            setCode("");
            onRedeemed();
        } catch {
            setError(REDEEM_FAILED);
        } finally {
            setRedeeming(false);
        }
    }

    // Sits inside the "Event codes" quest card; Claim credits the code.
    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Input
                    ref={inputRef}
                    type="text"
                    aria-label="Promo or event code"
                    aria-invalid={error !== null}
                    aria-describedby="redeem-code-note"
                    value={code}
                    onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setError(null);
                    }}
                    placeholder="XXXX-XXXX"
                    className="min-w-0 flex-1 font-mono tracking-widest"
                    maxLength={20}
                    disabled={redeeming}
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                />
                <Button
                    type="submit"
                    intent="commit"
                    disabled={redeeming || !code.trim()}
                >
                    {redeeming ? "Claiming…" : "Claim"}
                </Button>
            </div>
            {/* One line under the field: what codes are, or why one
                    failed. An error takes its place, so nothing moves. */}
            <p
                id="redeem-code-note"
                aria-live="polite"
                className={`text-sm ${
                    error ? "text-intent-danger-text" : "text-theme-text-muted"
                }`}
            >
                {error ??
                    "Have a code from a Pollinations event or promotion? Enter it for free API credits."}
            </p>
        </form>
    );
}
