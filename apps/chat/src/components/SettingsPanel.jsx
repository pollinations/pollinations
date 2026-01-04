import "./SettingsPanel.css";

const SettingsPanel = ({ isOpen, settings, onChange, onClose }) => {
    if (!isOpen) return null;

    const safeSettings = {
        systemPrompt: settings?.systemPrompt ?? "",
        maxTokens: settings?.maxTokens ?? 2000,
        temperature: settings?.temperature ?? 0.7,
        topP: settings?.topP ?? 1,
    };

    const handleValueChange =
        (field, parser = (value) => value) =>
        (event) => {
            const parsedValue = parser(event.target.value);
            onChange?.(field, parsedValue);
        };

    const clampNumber = (value, min, max) => {
        const numberValue = Number(value);
        if (Number.isNaN(numberValue)) return min;
        return Math.min(Math.max(numberValue, min), max);
    };

    return (
        <>
            <div
                className="settings-panel-overlay"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside
                className="settings-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Session settings"
            >
                <div className="settings-panel__header">
                    <div>
                        <p className="settings-panel__eyebrow">Workspace</p>
                        <h2>Session Settings</h2>
                        <p className="settings-panel__description">
                            Fine-tune how Pollinations responds by updating the
                            system prompt and generation caps.
                        </p>
                    </div>
                    <button
                        className="settings-panel__close"
                        onClick={onClose}
                        aria-label="Close settings panel"
                    >
                        <span>Close</span>
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M6 6l12 12M18 6l-12 12" />
                        </svg>
                    </button>
                </div>

                <div className="settings-panel__content">
                    <div className="settings-field">
                        <label htmlFor="systemPrompt">System prompt</label>
                        <textarea
                            id="systemPrompt"
                            value={safeSettings.systemPrompt}
                            placeholder="Describe the assistant's tone, expertise, or guardrails"
                            onChange={handleValueChange("systemPrompt")}
                            rows={6}
                        />
                        <p className="settings-field__hint">
                            This runs once at the start of every conversation.
                        </p>
                    </div>

                    <div className="settings-panel__grid">
                        <div className="settings-field">
                            <label htmlFor="maxTokens">Max tokens</label>
                            <input
                                id="maxTokens"
                                type="number"
                                min="256"
                                max="8000"
                                step="64"
                                value={safeSettings.maxTokens}
                                onChange={handleValueChange(
                                    "maxTokens",
                                    (value) => clampNumber(value, 256, 8000),
                                )}
                            />
                            <p className="settings-field__hint">
                                Sets the upper bound for each completion.
                            </p>
                        </div>

                        <div className="settings-field">
                            <div className="settings-field__label-row">
                                <label htmlFor="temperature">Temperature</label>
                                <span className="settings-field__value">
                                    {safeSettings.temperature.toFixed(2)}
                                </span>
                            </div>
                            <input
                                id="temperature"
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={safeSettings.temperature}
                                onChange={handleValueChange(
                                    "temperature",
                                    (value) => Number(value),
                                )}
                            />
                            <p className="settings-field__hint">
                                Lower for precise answers, higher for creative
                                ones.
                            </p>
                        </div>

                        <div className="settings-field">
                            <div className="settings-field__label-row">
                                <label htmlFor="topP">Top P</label>
                                <span className="settings-field__value">
                                    {safeSettings.topP.toFixed(2)}
                                </span>
                            </div>
                            <input
                                id="topP"
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={safeSettings.topP}
                                onChange={handleValueChange("topP", (value) =>
                                    Number(value),
                                )}
                            />
                            <p className="settings-field__hint">
                                Limits sampling to the most probable tokens.
                            </p>
                        </div>
                    </div>

                    <div className="settings-panel__actions">
                        <button
                            type="button"
                            className="settings-panel__ghost"
                            onClick={() => {
                                onChange?.(
                                    "systemPrompt",
                                    "You are a helpful AI assistant who speaks concisely and helpfully.",
                                );
                                onChange?.("maxTokens", 2000);
                                onChange?.("temperature", 0.7);
                                onChange?.("topP", 1);
                            }}
                        >
                            Reset to defaults
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default SettingsPanel;
