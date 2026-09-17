import { cn } from "../lib/cn.ts";
import { Chip } from "../primitives/Chip.tsx";
import { CheckIcon, ClipboardIcon } from "../primitives/icons/index.tsx";
import { CopyButton } from "./CopyButton.tsx";

export type KeyChipProps = {
    /** The visible start of the key, e.g. "sk_0ysBCkH". */
    prefix: string;
    /** The full key, when known: the chip then copies it on click. */
    value?: string | null;
    /** Accessible name for the copy action. */
    label?: string;
    className?: string;
};

const chipClassName =
    "polli:gap-1.5 polli:font-mono polli:font-normal polli:[&>svg]:size-3.5 polli:[&>svg]:shrink-0";

/**
 * One badge for every key: prefix and ellipsis, nothing else. A secret key
 * only ever shows its prefix; a key whose value is known copies on click and
 * carries the clipboard icon.
 */
export function KeyChip({
    prefix,
    value,
    label = "Copy key",
    className,
}: KeyChipProps) {
    const text = `${prefix}…`;
    if (!value) {
        return (
            <Chip intent="neutral" className={cn(chipClassName, className)}>
                {text}
            </Chip>
        );
    }
    return (
        <CopyButton
            value={value}
            tooltip={null}
            aria-label={label}
            className="polli:inline-flex polli:cursor-pointer polli:rounded-lg"
        >
            {(copied) => (
                <Chip
                    intent={copied ? "success" : "neutral"}
                    className={cn(
                        chipClassName,
                        "polli:transition-colors",
                        className,
                    )}
                >
                    {copied ? (
                        <CheckIcon aria-hidden="true" />
                    ) : (
                        <ClipboardIcon aria-hidden="true" />
                    )}
                    {copied ? "Copied" : text}
                </Chip>
            )}
        </CopyButton>
    );
}
