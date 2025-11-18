import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

const TEXT_PROMPTS = [
    "explain pollinations.ai",
    "write a poem about nature",
    "describe ecosystem harmony",
    "explain symbiosis",
];

/**
 * Text Generation Card Component
 * Interactive demo for the text generation API
 */
export function TextGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(TEXT_PROMPTS[0]);
    const [selectedModel, setSelectedModel] = useState(""); // Empty = default openai
    const [jsonMode, setJsonMode] = useState(false);
    const [response, setResponse] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const toggleModel = (model) => {
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
            <Heading variant="section">Text Generation</Heading>

            {/* Prompts/Parameters and Response - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>Pick a prompt</Label>
                        <div className="flex flex-wrap gap-2">
                            {TEXT_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => setSelectedPrompt(prompt)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedPrompt === prompt
                                            ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                            : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                    }`}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <Label>Model</Label>
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
                                            ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                            : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="font-body text-xs text-offblack/50 mt-2">
                            Default: openai
                        </p>
                    </div>

                    {/* Optional Parameters */}
                    <div>
                        <Label>Optional</Label>
                        <button
                            type="button"
                            onClick={() => setJsonMode(!jsonMode)}
                            className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                jsonMode
                                    ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                    : "bg-offblack/10 border-offblack/30 hover:border-rose"
                            }`}
                        >
                            json=true
                        </button>
                    </div>
                </div>

                {/* Right side: Response (no label, no border, no scrollbar) */}
                <div className="bg-offblack/5 p-3 min-h-[200px] max-h-[200px] overflow-hidden">
                    {isLoading ? (
                        <p className="text-offblack/50 font-body text-xs">
                            Generating...
                        </p>
                    ) : (
                        <p className="font-body text-offblack text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto h-full pr-2 scrollbar-hide">
                            {response}
                        </p>
                    )}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-offblack/5 font-mono text-xs break-all">
                <span className="text-offblack/40">
                    https://enter.pollinations.ai/api/generate/text/
                </span>
                <span className="bg-lime/90 px-1 font-black">
                    {selectedPrompt}
                </span>
                {(selectedModel || jsonMode) && (
                    <>
                        <span className="text-offblack/40">?</span>
                        {selectedModel && (
                            <span className="bg-lime/90 px-1 font-black">
                                model={selectedModel}
                            </span>
                        )}
                        {selectedModel && jsonMode && (
                            <span className="text-offblack/40">&</span>
                        )}
                        {jsonMode && (
                            <span className="bg-lime/90 px-1 font-black">
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
                Copy URL
            </Button>
        </div>
    );
}
