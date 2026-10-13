import {
    Alert,
    Button,
    Field,
    FieldStack,
    Input,
    Section,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { accountClient } from "../../api.ts";

const REDEEM_FAILED = "Couldn’t redeem the code. Please try again.";

/** Event codes arrive as a `?code=` link or are typed in from a talk. */
export function RedeemCode({ onRedeemed }: { onRedeemed: () => void }) {
    const [code, setCode] = useState(
        () => new URLSearchParams(window.location.search).get("code") ?? "",
    );
    const [error, setError] = useState<string | null>(null);
    const [credited, setCredited] = useState<number | null>(null);
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
            const { pollenAmount } = await response.json();
            setCredited(pollenAmount);
            setCode("");
            onRedeemed();
        } catch {
            setError(REDEEM_FAILED);
        } finally {
            setRedeeming(false);
        }
    }

    return (
        <Section title="Event code">
            {credited !== null && (
                <Alert intent="info">
                    {formatPollen(credited)} Quest Pollen added to your wallet.
                </Alert>
            )}
            <form onSubmit={handleSubmit} className="flex items-start gap-2">
                <FieldStack error={error} className="flex-1">
                    <Field.Input asChild>
                        <Input
                            ref={inputRef}
                            type="text"
                            aria-label="Event code"
                            value={code}
                            onChange={(e) => {
                                setCode(e.target.value.toUpperCase());
                                setError(null);
                            }}
                            placeholder="XXXX-XXXX"
                            className="w-full font-mono tracking-widest"
                            maxLength={20}
                            disabled={redeeming}
                            autoCapitalize="characters"
                            spellCheck={false}
                            required
                        />
                    </Field.Input>
                </FieldStack>
                <Button type="submit" disabled={redeeming || !code.trim()}>
                    {redeeming ? "Redeeming…" : "Redeem"}
                </Button>
            </form>
        </Section>
    );
}
