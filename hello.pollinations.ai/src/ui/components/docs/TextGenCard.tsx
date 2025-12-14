import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";
import { DOCS_PAGE } from "../../../theme";
import { API_KEY } from "../../../api.config";

/**
 * Text Generation Card Component
 * Interactive demo for the text generation API
 */
export function TextGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(
        DOCS_PAGE.textPrompts[0],
    );
    const [selectedModel, setSelectedModel] = useState(""); // Empty = default openai
    const [jsonMode, setJsonMode] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [response, setResponse] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const toggleModel = (model: string) => {
        // If clicking the active model, deactivate it (go back to default)
        setSelectedModel(selectedModel === model ? "" : model);
    };

    const buildUrl = () => {
        // For display only - show what the equivalent GET URL would look like
        let url = `https://enter.pollinations.ai/api/generate/text/${encodeURIComponent(
            selectedPrompt,
        )}`;
        const params = [];
        if (showKey) params.push("key={key}");
        if (selectedModel) params.push(`model=${selectedModel}`);
        if (jsonMode) params.push("json=true");
        if (params.length > 0) {
            url += "?" + params.join("&");
        }
        return url;
    };

    useEffect(() => {
        const buildTextUrl = () => {
            let url = `https://enter.pollinations.ai/api/generate/text/${encodeURIComponent(
                selectedPrompt,
            )}`;
            const params = [];
            if (selectedModel) params.push(`model=${selectedModel}`);
            if (jsonMode) params.push("json=true");
            if (params.length > 0) {
                url += "?" + params.join("&");
            }
            return url;
        };

        const fetchText = async () => {
            setIsLoading(true);
            try {
                // Use GET to /api/generate/text/{prompt}
                const url = buildTextUrl();
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                    },
                });
                const text = await res.text();
                setResponse(text);
                setIsLoading(false);
            } catch (error) {
                console.error("Text fetch error:", error);
                setIsLoading(false);
            }
        };

        fetchText();
    }, [selectedPrompt, selectedModel, jsonMode]);

    return (
        <div>
            <Heading variant="section">
                {DOCS_PAGE.textGenerationTitle.text}
            </Heading>

            {/* Prompts/Parameters and Response - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>{DOCS_PAGE.pickPromptLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            {DOCS_PAGE.textPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => setSelectedPrompt(prompt)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedPrompt === prompt
                                            ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                            : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                    }`}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <Label>{DOCS_PAGE.modelLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "mistral", label: "model=mistral" },
                                { value: "claude", label: "model=claude" },
                                {
                                    value: "qwen-coder",
                                    label: "model=qwen-coder",
                                },
                            ].map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => toggleModel(value)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedModel === value
                                            ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                            : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="font-body text-xs text-text-caption mt-2">
                            {DOCS_PAGE.defaultModelLabel.text}
                        </p>
                    </div>

                    {/* Optional Parameters */}
                    <div>
                        <Label>{DOCS_PAGE.optionalLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                    showKey
                                        ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                        : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                }`}
                            >
                                key={"{key}"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setJsonMode(!jsonMode)}
                                className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                    jsonMode
                                        ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                        : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                }`}
                            >
                                json=true
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right side: Response (no label, no border, no scrollbar) */}
                <div className="bg-surface-card p-3 min-h-[200px] max-h-[200px] overflow-hidden">
                    {isLoading ? (
                        <p className="text-text-caption font-body text-xs">
                            {DOCS_PAGE.generatingLabel.text}
                        </p>
                    ) : (
                        <p className="font-body text-text-body-main text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto h-full pr-2 scrollbar-hide">
                            {response}
                        </p>
                    )}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-input-background font-mono text-xs text-text-body-main break-all">
                <span className="text-text-caption">
                    https://enter.pollinations.ai/api/generate/text/
                </span>
                <span className="bg-indicator-text px-1 font-black text-text-inverse">
                    {encodeURIComponent(selectedPrompt)}
                </span>
                {(showKey || selectedModel || jsonMode) && (
                    <>
                        <span className="text-text-caption">?</span>
                        {showKey && (
                            <span className="bg-indicator-text px-1 font-black text-text-inverse">
                                key={"{key}"}
                            </span>
                        )}
                        {showKey && (selectedModel || jsonMode) && (
                            <span className="text-text-caption">&</span>
                        )}
                        {selectedModel && (
                            <span className="bg-indicator-text px-1 font-black text-text-inverse">
                                model={selectedModel}
                            </span>
                        )}
                        {selectedModel && jsonMode && (
                            <span className="text-text-caption">&</span>
                        )}
                        {jsonMode && (
                            <span className="bg-indicator-text px-1 font-black text-text-inverse">
                                json=true
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Copy Button */}
            <Button
                type="button"
                onClick={() => navigator.clipboard.writeText(buildUrl())}
                variant="copy"
                size={null}
            >
                {DOCS_PAGE.copyUrlButton.text}
            </Button>
        </div>
    );
}
