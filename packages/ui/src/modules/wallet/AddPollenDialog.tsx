import { AccountIdentity } from "../../compositions/AccountMenu.tsx";
import { ExternalLinkButton } from "../../compositions/ExternalLinkButton.tsx";
import { Button } from "../../primitives/Button.tsx";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Chip } from "../../primitives/Chip.tsx";
import { Dialog } from "../../primitives/Dialog.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import {
    GlobeIcon,
    WalletIcon,
    WarningIcon,
} from "../../primitives/icons/index.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { Heading } from "../../primitives/Typography.tsx";
import { AuthModal, AuthModalHeader } from "../auth/AuthModal.tsx";
import { formatPollen } from "./format-pollen.ts";
import { PollenAmountSlider } from "./PollenAmountSlider.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

export type AddPollenDialogProps = {
    open: boolean;
    amount: number;
    amounts: readonly number[];
    budget?: number;
    checkoutPack?: number | null;
    shortfall?: number;
    purchase?: {
        amount: number;
        priceLabel: string;
        feeLabel: string;
        amounts: readonly number[];
        onAmountChange: (amount: number) => void;
    };
    appName?: string;
    account?: {
        name: string;
        avatarUrl?: string;
        paid: number;
        quest: number;
    };
    busy?: boolean;
    error?: string | null;
    sandbox?: boolean;
    pending?: boolean;
    onAmountChange: (amount: number) => void;
    onContinue: () => void;
    onPurchase: () => void;
    onCheck: () => void;
    onClose: () => void;
};

/** Hosted selection uses a checked account balance; only unresolved payments show a dialog back in the app. */
export function AddPollenDialog({
    open,
    amount,
    amounts,
    budget,
    checkoutPack,
    shortfall = 0,
    purchase,
    appName,
    account,
    busy = false,
    error,
    sandbox,
    pending,
    onAmountChange,
    onContinue,
    onPurchase,
    onCheck,
    onClose,
}: AddPollenDialogProps) {
    const currentAllowance =
        budget !== undefined && Number.isFinite(budget) ? budget : 0;
    const allowanceOptions = [
        ...new Set([
            ...Array.from(
                {
                    length:
                        Math.ceil(currentAllowance + Math.max(...amounts)) + 1,
                },
                (_, value) => value,
            ),
            currentAllowance,
            currentAllowance + amount,
        ]),
    ]
        .filter((value) => value >= 0)
        .sort((a, b) => a - b);
    const content = (
        <div className="polli:space-y-4 polli:p-6 polli:text-theme-text-strong">
            {sandbox && (
                <p className="polli:text-xs polli:text-theme-text-muted">
                    Sandbox · Test balances and payments only
                </p>
            )}
            {pending ? (
                <>
                    <p>
                        Waiting for payment confirmation. Your account balance
                        will update after payment is processed.
                    </p>
                    <Button
                        type="button"
                        disabled={busy}
                        className="polli:min-h-12 polli:w-full"
                        onClick={onCheck}
                    >
                        {busy ? "Checking…" : "Check top-up"}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy}
                        className="polli:min-h-12 polli:w-full"
                        onClick={onClose}
                    >
                        Back to app
                    </Button>
                </>
            ) : (
                <>
                    <Heading as="h1" size="section" id="increase-limit-title">
                        App budget
                    </Heading>
                    <Surface variant="card" className="polli:space-y-4">
                        <p className="polli:text-sm polli:font-semibold">
                            {appName ?? "Connected app"}
                        </p>
                        <div className="polli:pb-20">
                            <PollenAmountSlider
                                invalid={!!checkoutPack}
                                describedBy={
                                    checkoutPack && shortfall > 0
                                        ? "budget-shortfall"
                                        : undefined
                                }
                                value={currentAllowance + amount}
                                amounts={allowanceOptions}
                                maxTicks={5}
                                onChange={(allowance) =>
                                    onAmountChange(allowance - currentAllowance)
                                }
                                label="New allowance"
                                selectedBadgeIntent={
                                    checkoutPack === undefined
                                        ? "neutral"
                                        : "info"
                                }
                                disabled={busy}
                                selectedBadgeSuffix={
                                    !!checkoutPack && shortfall > 0 ? (
                                        <Chip
                                            id="budget-shortfall"
                                            size="sm"
                                            intent="warning"
                                        >
                                            <WarningIcon
                                                aria-hidden="true"
                                                className="polli:h-3 polli:w-3"
                                            />
                                            {formatPollen(shortfall)} short
                                        </Chip>
                                    ) : undefined
                                }
                                selectedBadgeLabel={
                                    amount === 0
                                        ? "No change"
                                        : `${amount > 0 ? "+" : "−"}${formatPollen(Math.abs(amount))}`
                                }
                            />
                        </div>
                        {
                            <div className="polli:flex polli:justify-end polli:gap-3">
                                <Button
                                    type="button"
                                    disabled={busy}
                                    data-theme="neutral"
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    disabled={
                                        busy ||
                                        checkoutPack === undefined ||
                                        !!checkoutPack ||
                                        amount === 0
                                    }
                                    onClick={onContinue}
                                >
                                    {busy ? "Saving…" : "Save budget"}
                                </Button>
                            </div>
                        }
                        <div className="polli:mt-4 polli:space-y-2 polli:border-t polli:border-divider polli:pt-4 polli:text-[13px] polli:leading-snug polli:text-theme-text-muted">
                            <p className="polli:flex polli:items-start polli:gap-1.5">
                                <WalletIcon
                                    aria-hidden="true"
                                    className="polli:mt-0.5 polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                />
                                <span>
                                    Set how much pollen {appName ?? "this app"}{" "}
                                    can still use. Changing the budget doesn’t
                                    move pollen.
                                </span>
                            </p>
                        </div>
                    </Surface>
                    {account && (
                        <Heading as="h2" size="section">
                            Account top-up
                        </Heading>
                    )}
                    {account && purchase && (
                        <Surface
                            variant="card"
                            className="polli:space-y-4"
                            aria-label="Account top-up"
                        >
                            <input
                                type="hidden"
                                name="pollen-purchase-pack"
                                value={purchase.amount}
                            />
                            <div>
                                <div className="polli:flex polli:w-full polli:items-center polli:justify-between polli:gap-3 polli:text-theme-text-strong">
                                    <Dropdown
                                        portalled={false}
                                        className="polli:min-w-32 polli:p-1"
                                        trigger={(open) => (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                aria-label="Account purchase pack"
                                                className="polli-control polli:inline-flex polli:min-h-10 polli:items-center polli:gap-1.5 polli:py-1 polli:text-lg polli:font-semibold polli:text-theme-text-strong polli:disabled:opacity-50"
                                            >
                                                {formatPollen(purchase.amount)}
                                                <span className="polli:text-sm polli:font-normal">
                                                    pollen
                                                </span>
                                                <ChevronIcon
                                                    expanded={open}
                                                    className="polli:h-3 polli:w-3"
                                                />
                                            </button>
                                        )}
                                    >
                                        {(close) =>
                                            purchase.amounts.map((pack) => (
                                                <button
                                                    key={pack}
                                                    type="button"
                                                    aria-pressed={
                                                        pack === purchase.amount
                                                    }
                                                    className="polli-control polli:block polli:w-full polli:rounded polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:text-theme-text-strong polli:hover:bg-theme-bg-hover polli:aria-pressed:bg-theme-bg-active"
                                                    onClick={() => {
                                                        purchase.onAmountChange(
                                                            pack,
                                                        );
                                                        close();
                                                    }}
                                                >
                                                    {formatPollen(pack)} pollen
                                                </button>
                                            ))
                                        }
                                    </Dropdown>
                                    <div className="polli:flex polli:flex-col polli:items-end">
                                        <span className="polli:text-sm polli:font-semibold">
                                            {purchase.priceLabel}
                                        </span>
                                        <span className="polli:mt-1 polli:text-xs polli:text-theme-text-muted">
                                            {purchase.feeLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="polli:flex polli:justify-end polli:items-center polli:gap-3">
                                <Button
                                    type="button"
                                    disabled={busy}
                                    data-theme="neutral"
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <ExternalLinkButton
                                    disabled={
                                        busy || checkoutPack === undefined
                                    }
                                    onClick={onPurchase}
                                    title="Tax calculated at checkout"
                                    className="polli:min-w-0 polli:gap-1.5 polli:text-center polli:shadow-none"
                                >
                                    <span className="polli:inline-flex polli:items-center polli:gap-1.5">
                                        <WalletIcon
                                            aria-hidden="true"
                                            className="polli:h-4 polli:w-4 polli:shrink-0"
                                        />
                                        Buy
                                    </span>
                                </ExternalLinkButton>
                            </div>
                            <div className="polli:border-t polli:border-divider polli:pt-4 polli:text-[13px] polli:leading-snug polli:text-theme-text-muted">
                                <p className="polli:flex polli:items-start polli:gap-1.5">
                                    <GlobeIcon
                                        aria-hidden="true"
                                        className="polli:mt-0.5 polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                    />
                                    <span>
                                        Tax added at checkout ·{" "}
                                        <InlineLink
                                            href="https://pollinations.ai/refunds"
                                            showIcon={false}
                                        >
                                            Refund Policy
                                        </InlineLink>
                                    </span>
                                </p>
                            </div>
                        </Surface>
                    )}
                    {checkoutPack === undefined && (
                        <p className="polli:text-sm polli:text-theme-text-muted">
                            Checking account balance…
                        </p>
                    )}
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </div>
    );
    if (!open) return null;
    if (pending)
        return (
            <Dialog
                open
                onOpenChange={(next) => {
                    if (!next && !busy) onClose();
                }}
                size="sm"
                title="App allowance"
                contentClassName="polli:max-h-[calc(100dvh-2rem)] polli:overflow-y-auto polli:border-0 polli:rounded-2xl polli:bg-theme-bg-pale polli:shadow-container"
            >
                {content}
            </Dialog>
        );
    return (
        <AuthModal
            dialog={{ labelledBy: "increase-limit-title" }}
            contentClassName="polli-scrollbar-subtle polli:overflow-y-auto"
        >
            <AuthModalHeader logoOnly>
                {account && (
                    <div
                        data-theme="neutral"
                        className="polli:inline-flex polli:min-w-0 polli:max-w-full polli:rounded-full polli:bg-theme-bg-subtle polli:p-1 polli:pr-3"
                    >
                        <AccountIdentity
                            name={account.name}
                            avatarUrl={account.avatarUrl}
                            secondaryContent={
                                <span className="polli:inline-flex polli:items-center polli:gap-2 polli:text-xs polli:tabular-nums">
                                    <span className="polli:inline-flex polli:items-center polli:gap-1">
                                        <WalletKindIcon kind="paid" />
                                        <span className="polli:sr-only">
                                            Paid pollen:{" "}
                                        </span>
                                        {formatPollen(account.paid)}
                                    </span>
                                    <span className="polli:inline-flex polli:items-center polli:gap-1">
                                        <WalletKindIcon kind="tier" />
                                        <span className="polli:sr-only">
                                            Quest pollen:{" "}
                                        </span>
                                        {formatPollen(account.quest)}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                )}
            </AuthModalHeader>
            {content}
        </AuthModal>
    );
}
