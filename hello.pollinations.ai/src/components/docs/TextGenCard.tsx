import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";
import { TextGenerator } from "../TextGenerator";
import { DOCS_PAGE } from "../../config/content";
import { API_KEY } from "../../config/api";

/**
 * Text Generation Card Component
 * Interactive demo for the text generation API
 */
export function TextGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(
        DOCS_PAGE.textPrompts[0]
    );
    const [selectedModel, setSelectedModel] = useState(""); // Empty = default openai
    const [jsonMode, setJsonMode] = useState(false);
    const [response, setResponse] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const toggleModel = (model: string) => {
        // If clicking the active model, deactivate it (go back to default)
        setSelectedModel(selectedModel === model ? "" : model);
    };

    const buildUrl = () => {
        // For display only - show what the equivalent GET URL would look like
        let url = `https://enter.pollinations.ai/api/generate/text/${encodeURIComponent(
            selectedPrompt
        )}`;
        const params = [];
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
                selectedPrompt
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
                <TextGenerator content={DOCS_PAGE.textGenerationTitle} />
            </Heading>

            {/* Prompts/Parameters and Response - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>
                            <TextGenerator
                                content={DOCS_PAGE.pickPromptLabel}
                            />
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {DOCS_PAGE.textPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => setSelectedPrompt(prompt)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedPrompt === prompt
                                            ? "bg-yellow border-pink font-black shadow-pink-sm"
                                            : "bg-gray-ultra-light border-gray hover:border-pink"
                                    }`}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <Label>
                            <TextGenerator content={DOCS_PAGE.modelLabel} />
                        </Label>
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
                                            ? "bg-yellow border-pink font-black shadow-pink-sm"
                                            : "bg-gray-ultra-light border-gray hover:border-pink"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="font-body text-xs text-gray mt-2">
                            <TextGenerator
                                content={DOCS_PAGE.defaultModelLabel}
                            />
                        </p>
                    </div>

                    {/* Optional Parameters */}
                    <div>
                        <Label>
                            <TextGenerator content={DOCS_PAGE.optionalLabel} />
                        </Label>
                        <button
                            type="button"
                            onClick={() => setJsonMode(!jsonMode)}
                            className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                jsonMode
                                    ? "bg-yellow border-pink font-black shadow-pink-sm"
                                    : "bg-gray-ultra-light border-gray hover:border-pink"
                            }`}
                        >
                            json=true
                        </button>
                    </div>
                </div>

                {/* Right side: Response (no label, no border, no scrollbar) */}
                <div className="bg-gray-medium p-3 min-h-[200px] max-h-[200px] overflow-hidden">
                    {isLoading ? (
                        <p className="text-gray font-body text-xs">
                            <TextGenerator
                                content={DOCS_PAGE.generatingLabel}
                            />
                        </p>
                    ) : (
                        <p className="font-body text-charcoal text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto h-full pr-2 scrollbar-hide">
                            {response}
                        </p>
                    )}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-gray-ultra-light font-mono text-xs break-all">
                <span className="text-gray">
                    https://enter.pollinations.ai/api/generate/text/
                </span>
                <span className="bg-yellow px-1 font-black">
                    {selectedPrompt}
                </span>
                {(selectedModel || jsonMode) && (
                    <>
                        <span className="text-gray">?</span>
                        {selectedModel && (
                            <span className="bg-yellow px-1 font-black">
                                model={selectedModel}
                            </span>
                        )}
                        {selectedModel && jsonMode && (
                            <span className="text-gray">&</span>
                        )}
                        {jsonMode && (
                            <span className="bg-yellow px-1 font-black">
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
                <TextGenerator content={DOCS_PAGE.copyUrlButton} />
            </Button>
        </div>
    );
}
