import { Chip, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import type { FC } from "react";

type BalanceAccess = "quest" | "paid";

type ModelStatusChipsProps = {
    showNew: boolean;
    showAlpha: boolean;
    balanceAccess?: BalanceAccess;
    alphaTooltip?: boolean;
    balanceTooltip?: boolean;
};

export const ModelStatusChips: FC<ModelStatusChipsProps> = ({
    showNew,
    showAlpha,
    balanceAccess,
    alphaTooltip = true,
    balanceTooltip = true,
}) => {
    if (!showNew && !showAlpha && !balanceAccess) {
        return null;
    }

    const balanceChip =
        balanceAccess === "paid" ? (
            <PaidChip size="sm" className="whitespace-nowrap">
                <WalletKindIcon kind="paid" />
                Paid
            </PaidChip>
        ) : balanceAccess === "quest" ? (
            <TierChip size="sm" className="whitespace-nowrap">
                <WalletKindIcon kind="tier" />
                Quest
            </TierChip>
        ) : null;

    const balanceTooltipText =
        balanceAccess === "paid"
            ? "Uses Paid Pollen. Quest Pollen is not used for this model."
            : "Uses Quest Pollen first, then Paid Pollen when Quest balance cannot cover the request.";

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            {showNew && (
                <Chip intent="news" size="sm">
                    NEW
                </Chip>
            )}
            {showAlpha &&
                (alphaTooltip ? (
                    <Tooltip
                        triggerAs="span"
                        content="Alpha model — experimental, may be unstable"
                    >
                        <Chip intent="alpha" size="sm">
                            ALPHA
                        </Chip>
                    </Tooltip>
                ) : (
                    <Chip intent="alpha" size="sm">
                        ALPHA
                    </Chip>
                ))}
            {balanceChip &&
                (balanceTooltip ? (
                    <Tooltip triggerAs="span" content={balanceTooltipText}>
                        {balanceChip}
                    </Tooltip>
                ) : (
                    balanceChip
                ))}
        </span>
    );
};
