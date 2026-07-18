import { apiClient } from "@frontend/api.ts";
import {
    Alert,
    Button,
    ExternalLinkButton,
    Field,
    Input,
    Surface,
    Tooltip,
    WalletIcon,
} from "@pollinations/ui";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { type FC, useEffect, useRef, useState } from "react";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";
import { PollenPackSlider } from "./pollen-pack-controls.tsx";

type RecipientState =
    | { status: "idle" }
    | { status: "loading" }
    | {
          status: "found";
          name: string;
          image: string | null;
          githubUsername: string;
      }
    | { status: "error"; message: string };

const LOOKUP_DEBOUNCE_MS = 400;

export const GiftPanel: FC = () => {
    const [selectedPackAmount, setSelectedPackAmount] = useState(
        POLLEN_PACKS[1]?.amountUsd ?? 5,
    );
    const [githubUsername, setGithubUsername] = useState("");
    const [recipient, setRecipient] = useState<RecipientState>({
        status: "idle",
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const trimmed = githubUsername.trim();
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!trimmed) {
            setRecipient({ status: "idle" });
            return;
        }

        setRecipient({ status: "loading" });
        debounceRef.current = setTimeout(async () => {
            try {
                const response = await apiClient.gifts.lookup[
                    ":githubUsername"
                ].$get({
                    param: { githubUsername: trimmed },
                });
                const payload: unknown = await response
                    .json()
                    .catch(() => ({}));
                if (!response.ok) {
                    const message =
                        typeof payload === "object" &&
                        payload &&
                        "error" in payload &&
                        typeof (payload as { error: unknown }).error ===
                            "string"
                            ? (payload as { error: string }).error
                            : "Couldn't find that account.";
                    setRecipient({ status: "error", message });
                    return;
                }
                const data = payload as {
                    name: string;
                    image: string | null;
                    githubUsername: string;
                };
                setRecipient({ status: "found", ...data });
            } catch {
                setRecipient({
                    status: "error",
                    message: "Couldn't look that up. Try again.",
                });
            }
        }, LOOKUP_DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [githubUsername]);

    const selectedPackIndex = Math.max(
        0,
        POLLEN_PACKS.findIndex((pack) => pack.amountUsd === selectedPackAmount),
    );
    const selectedPack = POLLEN_PACKS[selectedPackIndex] ?? POLLEN_PACKS[0];
    const serviceFeeCents = selectedPack
        ? calculateServiceFeeCents(selectedPack.amountUsd * 100)
        : 0;
    const subtotalBeforeTaxCents =
        (selectedPack?.amountUsd ?? 0) * 100 + serviceFeeCents;
    const chargeLabel = selectedPack
        ? formatUsdCentsCompact(subtotalBeforeTaxCents)
        : "$0";

    const canSend = Boolean(selectedPack) && recipient.status === "found";

    return (
        <>
            <Surface>
                {selectedPack && (
                    <div className="flex w-full flex-col gap-5">
                        <Field.Root>
                            <Field.Label className="mb-2 block text-sm font-semibold">
                                Recipient's GitHub username
                            </Field.Label>
                            <Input
                                value={githubUsername}
                                onChange={(event) =>
                                    setGithubUsername(event.target.value)
                                }
                                placeholder="octocat"
                                className="w-full max-w-xs"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </Field.Root>

                        {recipient.status === "loading" && (
                            <p className="text-sm text-theme-text-muted">
                                Looking up account…
                            </p>
                        )}
                        {recipient.status === "error" && (
                            <Alert intent="danger">{recipient.message}</Alert>
                        )}
                        {recipient.status === "found" && (
                            <div className="flex items-center gap-3 rounded-xl bg-theme-bg-pale px-3 py-2">
                                {recipient.image && (
                                    <img
                                        src={recipient.image}
                                        alt={`${recipient.name} avatar`}
                                        className="h-8 w-8 shrink-0 rounded-full"
                                    />
                                )}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-theme-text-strong">
                                        {recipient.name}
                                    </p>
                                    <p className="truncate text-xs text-theme-text-muted">
                                        @{recipient.githubUsername}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex w-full flex-col items-start gap-4 pb-10 sm:flex-row sm:items-center sm:gap-4 sm:pb-20">
                            <div className="w-full min-w-0 flex-1 pb-20 sm:pb-0">
                                <PollenPackSlider
                                    value={selectedPack.amountUsd}
                                    onChange={setSelectedPackAmount}
                                    selectedBadgeLabel={chargeLabel}
                                    selectedBadgeDetail={`incl. ${formatUsdCentsCompact(serviceFeeCents)} fee`}
                                />
                            </div>
                            <Tooltip
                                content={
                                    <span className="block">
                                        Gift{" "}
                                        <span className="font-semibold text-theme-text-strong">
                                            {selectedPack.amountUsd} pollen
                                        </span>{" "}
                                        for{" "}
                                        <span className="font-semibold text-theme-text-strong">
                                            {chargeLabel}
                                        </span>
                                        <span className="mt-1 block text-theme-text-muted">
                                            Tax calculated at checkout
                                        </span>
                                    </span>
                                }
                                displayContents
                            >
                                {canSend && recipient.status === "found" ? (
                                    <ExternalLinkButton
                                        href={`/api/gifts/checkout/${selectedPack.packKey}/${encodeURIComponent(recipient.githubUsername)}`}
                                        target="_self"
                                        className="w-28 min-w-0 gap-1.5 self-start text-center shadow-none sm:shrink-0 sm:self-center"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <WalletIcon className="h-4 w-4 shrink-0" />
                                            Gift
                                        </span>
                                    </ExternalLinkButton>
                                ) : (
                                    <Button
                                        as="button"
                                        type="button"
                                        disabled
                                        className="w-28 min-w-0 gap-1.5 self-start text-center shadow-none sm:shrink-0 sm:self-center"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <WalletIcon className="h-4 w-4 shrink-0" />
                                            Gift
                                        </span>
                                    </Button>
                                )}
                            </Tooltip>
                        </div>
                    </div>
                )}
            </Surface>
            <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <PaymentTrustBadge className="mt-0 pt-0" />
                <p>
                    Your recipient needs a Pollinations account already. We'll
                    check as you type.
                </p>
            </div>
        </>
    );
};
