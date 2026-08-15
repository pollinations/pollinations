import { Chip, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { FC } from "react";

export type BalanceAccess = "quest" | "paid";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    alphaTooltip?: boolean;
    perUserRpm?: number | null;
};

type BalanceAccessChipProps = {
    access: BalanceAccess;
    className?: string;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    alphaTooltip = true,
    perUserRpm,
}) => {
    if (!showNew && !showAlpha && perUserRpm == null) {
        return null;
    }

    const rate =
        perUserRpm == null
            ? undefined
            : {
                  label: `${perUserRpm} RPM/user`,
                  tooltip: `Per-user rate limit: ${perUserRpm} requests per minute.`,
              };

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
            {rate && (
                <Tooltip
                    triggerAs="span"
                    content={rate.tooltip}
                    displayContents
                >
                    <Chip intent="neutral" size="sm">
                        {rate.label}
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
