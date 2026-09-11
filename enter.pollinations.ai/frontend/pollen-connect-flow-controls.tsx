import { Switch } from "@pollinations/ui";
import {
    appVariantSupportsProtocol,
    authorizeRequestErrors,
} from "./pollen-connect-canvas-data";
import { previewPollenOptions } from "./pollen-connect-request-config";

export function FlowSwitch({
    label,
    checked,
    disabled,
    onChange,
}: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div
            className="journey-switch-row"
            data-disabled={disabled || undefined}
        >
            <span>{label}</span>
            <Switch
                ariaLabel={label}
                checked={checked}
                disabled={disabled}
                onChange={onChange}
            />
        </div>
    );
}

export function AppRequestSelect({
    value,
    oauth = true,
    onChange,
}: {
    value: string;
    oauth?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <label className="journey-switch-row">
            <span>App request</span>
            <select
                aria-label="App request"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="">Valid request</option>
                {authorizeRequestErrors
                    .filter((variant) =>
                        appVariantSupportsProtocol(
                            variant,
                            oauth ? "oauth" : "direct",
                        ),
                    )
                    .map((variant) => (
                        <option
                            key={variant.label}
                            value={variant.params?.request_error}
                        >
                            {variant.label}
                        </option>
                    ))}
            </select>
        </label>
    );
}

export function FlowSelect({
    label,
    value,
    options,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly { id: string; label: string }[];
    disabled?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <label
            className="journey-switch-row"
            data-disabled={disabled || undefined}
        >
            <span>{label}</span>
            <select
                aria-label={label}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function PollenPreviewSelect({
    paid,
    quest,
    disabled,
    onChange,
}: {
    paid: number;
    quest: number;
    disabled?: boolean;
    onChange: (balances: { paid: number; quest: number }) => void;
}) {
    return (
        <FlowSelect
            label="Pollen"
            value={paid > 0 ? "paid" : quest > 0 ? "quest" : "empty"}
            options={previewPollenOptions}
            disabled={disabled}
            onChange={(id) => {
                const option = previewPollenOptions.find(
                    (option) => option.id === id,
                );
                if (option)
                    onChange({ paid: option.paid, quest: option.quest });
            }}
        />
    );
}
