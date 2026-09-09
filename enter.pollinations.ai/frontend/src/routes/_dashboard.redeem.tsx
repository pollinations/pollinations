import { Button, InlineLink, Input, Section } from "@pollinations/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../api.ts";
import { SignedOutAccountArea } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/redeem")({
    component: RedeemGift,
});

function RedeemGift() {
    const { user } = Route.useRouteContext();
    const router = useRouter();
    const [code, setCode] = useState(() => window.location.hash.slice(1));
    const [reward, setReward] = useState<{
        id: string;
        pollenAmount: number;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const [claimed, setClaimed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function preview() {
        setBusy(true);
        setError(null);
        setReward(null);
        try {
            const response = await apiClient.quests.gifts.preview.$post({
                json: { code: code.trim() },
            });
            if (!response.ok)
                throw new Error("Gift code is invalid or no longer available.");
            setReward(await response.json());
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not open gift. Try again.",
            );
        } finally {
            setBusy(false);
        }
    }

    async function claim() {
        if (!reward) return;
        setBusy(true);
        setError(null);
        try {
            const response = await apiClient.quests.rewards[
                ":rewardId"
            ].claim.$post({
                param: { rewardId: reward.id },
                json: { code: code.trim() },
            });
            if (!response.ok) throw new Error("Gift is no longer available.");
            const result = await response.json();
            if (!result.reward.claimedAt)
                throw new Error("Could not claim gift. Try again.");
            setClaimed(true);
            await router.invalidate();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not claim gift. Try again.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Section title="Bonus rewards" framed>
            <div className="flex max-w-lg flex-col gap-4">
                <h2 className="text-xl font-semibold">Pollen gift</h2>
                {!user ? (
                    <>
                        <p>
                            Sign in to open your gift. Opening it does not claim
                            it.
                        </p>
                        <SignedOutAccountArea />
                    </>
                ) : claimed ? (
                    <>
                        <p>
                            {reward?.pollenAmount} Paid Pollen added to your
                            wallet.
                        </p>
                        <InlineLink href="/quests">
                            View your Bonus rewards
                        </InlineLink>
                    </>
                ) : (
                    <>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void preview();
                            }}
                            className="flex flex-col gap-3"
                        >
                            <label htmlFor="gift-code">Gift code</label>
                            <Input
                                id="gift-code"
                                value={code}
                                onChange={(event) => {
                                    setCode(event.target.value);
                                    setReward(null);
                                }}
                                autoComplete="off"
                                spellCheck={false}
                                required
                                disabled={busy}
                            />
                            <Button
                                type="submit"
                                disabled={busy || !code.trim()}
                            >
                                Open gift
                            </Button>
                        </form>
                        {reward && (
                            <div className="flex flex-col gap-2">
                                <p>
                                    You received {reward.pollenAmount} Pollen.
                                </p>
                                <Button
                                    onClick={() => void claim()}
                                    disabled={busy}
                                >
                                    Claim {reward.pollenAmount} Pollen
                                </Button>
                            </div>
                        )}
                    </>
                )}
                {error && (
                    <p role="alert" className="text-intent-danger-text">
                        {error}
                    </p>
                )}
            </div>
        </Section>
    );
}
