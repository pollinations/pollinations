import { Switch } from "@pollinations/ui";
import { authorizeRequestErrors } from "./pollen-connect-canvas-data";

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
    errorsOnly = false,
    onChange,
}: {
    value: string;
    oauth?: boolean;
    errorsOnly?: boolean;
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
                {!errorsOnly && <option value="">Valid request</option>}
                {authorizeRequestErrors
                    .filter(
                        (variant) =>
                            oauth ||
                            [
                                "redirect",
                                "app",
                                "lookup",
                                "missing-redirect",
                                "invalid-redirect",
                                "response-type",
                            ].includes(variant.params?.request_error ?? ""),
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
