import { PollenAmountSlider } from "@pollinations/ui/wallet";
import { POLLEN_PACKS, type PollenPack } from "@shared/pollen-packs.ts";
import type { FC } from "react";

type PollenPackSliderProps = {
    value: number;
    onChange: (value: number) => void;
    packs?: ReadonlyArray<PollenPack>;
    label?: string;
    selectedBadgeLabel?: string;
    selectedBadgeDetail?: string;
    disabled?: boolean;
};

export const PollenPackSlider: FC<PollenPackSliderProps> = ({
    value,
    onChange,
    packs = POLLEN_PACKS,
    label = "Select amount",
    selectedBadgeLabel,
    selectedBadgeDetail,
    disabled = false,
}) => (
    <PollenAmountSlider
        value={value}
        onChange={onChange}
        amounts={packs.map((pack) => pack.amountUsd)}
        label={label}
        selectedBadgeLabel={selectedBadgeLabel ?? `$${value}`}
        selectedBadgeDetail={selectedBadgeDetail}
        disabled={disabled}
    />
);
