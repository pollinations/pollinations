import { CardIcon, SproutIcon } from "../../primitives/icons/index.tsx";

export type ModelAccessIconProps = {
    paidOnly?: boolean;
    className?: string;
};

/** Compact model-access marker shared by every model picker. */
export function ModelAccessIcon({
    paidOnly = false,
    className = "polli:h-3.5 polli:w-3.5",
}: ModelAccessIconProps) {
    const label = paidOnly ? "Paid Pollen required" : "Works with any Pollen";
    const Icon = paidOnly ? CardIcon : SproutIcon;

    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className="polli:inline-flex polli:shrink-0"
        >
            <Icon className={className} />
        </span>
    );
}
