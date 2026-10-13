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
            icon={onChange ? undefined : <EarningsIcon />}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            info={
                <InfoTip
                    text={
                        onChange
                            ? "When enabled, users pay 25% above the base rate. You receive that markup, 20% of what they pay, in your balance. Your own spending does not generate earnings."
                            : "You pay 25% above the base rate. That markup, 20% of what you pay, goes to this app’s developer. The developer’s own spending does not generate earnings."
                    }
                    label="App earnings information"
                />
            }
        >
            <span className="inline">
                {onChange && (
                    <EarningsIcon className="mr-1.5 inline-block h-3.5 w-3.5 align-text-bottom text-intent-info-text" />
                )}
                {onChange
                    ? "Receive 20% of the pollen users spend in your app"
                    : "20% of the pollen you spend in this app goes to its developer."}
            </span>
        </AuthAccessItem>
    );
}
