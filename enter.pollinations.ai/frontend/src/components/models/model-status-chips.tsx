import { Chip, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    showStable?: boolean;
    alphaTooltip?: boolean;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    showStable = false,
    alphaTooltip = true,
}) => {
    if (!showNew && !showAlpha && !showStable) {
        return null;
    }

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            {showNew && (
                <Chip intent="news" size="sm">
                    New
                </Chip>
            )}
            {showAlpha &&
                (alphaTooltip ? (
                    <Tooltip
                        triggerAs="span"
                        content="Alpha model — experimental, may be unstable"
                        displayContents
                    >
                        <Chip intent="alpha" size="sm">
                            Alpha
                        </Chip>
                    </Tooltip>
                ) : (
                    <Chip intent="alpha" size="sm">
                        Alpha
                    </Chip>
                ))}
            {showStable && (
                <Tooltip
                    triggerAs="span"
                    content="Community model group — backed by multiple providers for higher reliability"
                >
                    <Chip intent="stable" size="sm">
                        STABLE
                    </Chip>
                </Tooltip>
            )}
        </span>
    );
};

export const BalanceAccessChip: FC<BalanceAccessChipProps> = ({
    access,
    className,
}) => {
    const tooltipContent =
        access === "paid"
            ? "Paid Pollen only."
            : "Uses Quest Pollen first, then Paid Pollen if needed.";

    const chip =
        access === "paid" ? (
            <PaidChip size="sm" className={className}>
                <WalletKindIcon kind="paid" />
                Paid
            </PaidChip>
        ) : (
            <TierChip size="sm" className={className}>
                <WalletKindIcon kind="tier" />
                Quest
            </TierChip>
        );

    return (
        <Tooltip
            triggerAs="span"
            content={tooltipContent}
            ariaLabel={tooltipContent}
            className="pointer-events-auto shrink-0"
            displayContents
        >
            {chip}
        </Tooltip>
    );
};
