import { Input } from "@pollinations/ui";
import { AppRequestSelect, FlowSwitch } from "./pollen-connect-flow-controls";
import {
    previewModelOptions,
    previewScopeOptions,
} from "./pollen-connect-request-config";

type PreviewControlsProps = {
    values: Record<string, string>;
    onChange: (patch: Record<string, string>) => void;
};

export function ConnectionBlockedControls({
    values,
    onChange,
}: PreviewControlsProps) {
    return (
        <div className="consent-preview-controls">
            <AppRequestSelect
                errorsOnly
                value={values.request_error ?? "redirect"}
                onChange={(request_error) => onChange({ request_error })}
            />
            <FlowSwitch
                label="Signed in to Pollinations"
                checked={values.screen === "oauth"}
                onChange={(on) =>
                    onChange({
                        screen: on ? "oauth" : "oauth-request-signed-out",
                    })
                }
            />
            <FlowSwitch
                label="Originating app page known"
                checked={values.origin !== "none"}
                onChange={(on) => onChange({ origin: on ? "known" : "none" })}
            />
        </div>
    );
}

export function ConsentPreviewControls({
    values,
    onChange,
}: PreviewControlsProps) {
    const scopes = new Set(
        (values.request_scope ?? "profile usage keys")
            .split(/\s+/)
            .filter(Boolean),
    );
    return (
        <div className="consent-preview-controls">
            <fieldset>
                <legend>Requested permissions</legend>
                {previewScopeOptions.map(({ id, label }) => (
                    <FlowSwitch
                        key={id}
                        label={label}
                        checked={scopes.has(id)}
                        onChange={(on) => {
                            const next = new Set(scopes);
                            if (on) next.add(id);
                            else next.delete(id);
                            onChange({
                                request_scope: previewScopeOptions
                                    .filter(({ id }) => next.has(id))
                                    .map(({ id }) => id)
                                    .join(" "),
                            });
                        }}
                    />
                ))}
            </fieldset>
            <fieldset>
                <legend>AI generation</legend>
                <FlowSwitch
                    label="App requests paid-only models"
                    checked={values.request_models === "paid"}
                    onChange={(on) =>
                        onChange({ request_models: on ? "paid" : "all" })
                    }
                />
                {values.request_models !== "paid" && (
                    <label className="journey-switch-row">
                        <span>Models</span>
                        <select
                            aria-label="Models"
                            value={values.request_models ?? "all"}
                            onChange={(event) =>
                                onChange({ request_models: event.target.value })
                            }
                        >
                            {previewModelOptions
                                .filter(({ id }) => id !== "paid")
                                .map(({ id, label }) => (
                                    <option key={id} value={id}>
                                        {label}
                                    </option>
                                ))}
                        </select>
                    </label>
                )}
                <FlowSwitch
                    label="App earns 20%"
                    checked={values.request_earnings !== "0"}
                    onChange={(on) =>
                        onChange({ request_earnings: on ? "1" : "0" })
                    }
                />
            </fieldset>
            <fieldset>
                <legend>Pollen</legend>
                {[
                    ["sim_paid", "Paid Pollen", "10"],
                    ["sim_quest", "Quest Pollen", "5"],
                ].map(([key, label, fallback]) => (
                    <label
                        key={key}
                        htmlFor={`preview-${key}`}
                        className="journey-switch-row"
                    >
                        <span>{label}</span>
                        <Input
                            id={`preview-${key}`}
                            aria-label={label}
                            type="number"
                            min="0"
                            step="1"
                            value={values[key] ?? fallback}
                            onChange={(event) =>
                                onChange({ [key]: event.target.value })
                            }
                        />
                    </label>
                ))}
            </fieldset>
        </div>
    );
}
