import { EarningsIcon, InfoTip } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";

/** The same earnings disclosure for app owners and people connecting to apps. */
export function AppEarningsRow({
    checked,
    onChange,
    disabled,
}: {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <AuthAccessItem
            className="polli:flex-nowrap"
            icon={onChange ? undefined : <EarningsIcon />}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            info={
                <InfoTip
                    text="When enabled, users pay 25% above the base rate. That markup, 20% of what they pay, goes to the app’s developer. The developer’s own spending does not generate earnings."
                    label="App earnings information"
                />
            }
        >
            <span className="inline-flex items-center gap-1.5">
                {onChange && (
                    <EarningsIcon className="h-3.5 w-3.5 shrink-0 text-intent-info-text" />
                )}
                {onChange
                    ? "Receive 20% of the pollen users spend in your app"
                    : "20% of the pollen you spend in this app goes to its developer."}
            </span>
        </AuthAccessItem>
    );
}
