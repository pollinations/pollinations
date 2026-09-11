import {
    FlowSelect,
    FlowSwitch,
    PollenPreviewSelect,
} from "./pollen-connect-flow-controls";
import {
    previewModelOptions,
    previewScopeOptions,
} from "./pollen-connect-request-config";

type PreviewControlsProps = {
    showPollen?: boolean;
    values: Record<string, string>;
    onChange: (patch: Record<string, string>) => void;
};

export function ConnectionBlockedControls({
    values,
    onChange,
}: PreviewControlsProps) {
    return (
        <div className="consent-preview-controls">
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
    showPollen = true,
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
                <FlowSelect
                    label="Models"
                    value={values.request_models ?? "all"}
                    options={previewModelOptions}
                    onChange={(request_models) => onChange({ request_models })}
                />
                {values.request_models !== "none" && (
                    <FlowSwitch
                        label="App earns 20%"
                        checked={values.request_earnings !== "0"}
                        onChange={(on) =>
                            onChange({ request_earnings: on ? "1" : "0" })
                        }
                    />
                )}
            </fieldset>
            {showPollen && (
                <PollenPreviewSelect
                    paid={Number(values.sim_paid ?? 10)}
                    quest={Number(values.sim_quest ?? 5)}
                    onChange={({ paid, quest }) =>
                        onChange({ sim_paid: `${paid}`, sim_quest: `${quest}` })
                    }
                />
            )}
        </div>
    );
}
