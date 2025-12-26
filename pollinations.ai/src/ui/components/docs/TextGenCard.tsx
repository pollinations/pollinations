import { useEffect, useState } from "react";
import { API_BASE, API_KEY } from "../../../api.config";
import { COPY_CONSTANTS } from "../../../copy/constants";
import { DOCS_PAGE } from "../../../copy/content/docs";
import { EXAMPLE_PROMPTS } from "../../../copy/examples";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { fetchWithRetry } from "../../../utils/fetchWithRetry";
import { Button } from "../ui/button";
import { Heading, Label } from "../ui/typography";

/**
 * Text Generation Card Component
 * Interactive demo for the text generation API
 */
export function TextGenCard() {
    // Get translated copy
    const { copy } = usePageCopy(DOCS_PAGE);

    // Example prompts (not translated)
    const textPrompts = EXAMPLE_PROMPTS.text;

    // Track by index
    const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
    const selectedPrompt = textPrompts[selectedPromptIndex] || textPrompts[0];

    const [selectedModel, setSelectedModel] = useState("openai-fast");
    const [params, setParams] = useState<Set<string>>(new Set());
    const [response, setResponse] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [models, setModels] = useState<string[]>([]);

    // Fetch available models from API
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await fetch(`${API_BASE}/text/models`, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                const data = await response.json();
                const modelIds = data.map((m: { name?: string } | string) =>
                    typeof m === "string" ? m : m.name || "",
                );
                setModels(modelIds);
                if (modelIds.length > 0 && !modelIds.includes("openai-fast")) {
                    setSelectedModel(modelIds[0]);
                }
            } catch (err) {
                console.error("Failed to fetch text models:", err);
            }
        };
        fetchModels();
    }, []);

    const toggleParam = (param: string) => {
        const newParams = new Set(params);
        if (newParams.has(param)) {
            newParams.delete(param);
        } else {
            newParams.add(param);
        }
        setParams(newParams);
    };

    const buildUrl = () => {
        let url = `${API_BASE}/text/${encodeURIComponent(selectedPrompt)}`;
        const urlParams = new URLSearchParams();
        urlParams.append("model", selectedModel);
        if (params.size > 0) {
            Array.from(params).forEach((p) => {
                const [key, value] = p.split("=");
                urlParams.append(key, value);
            });
        }
        const paramString = urlParams.toString();
        if (paramString) {
            url += "?" + paramString;
        }
        return url;
    };

    useEffect(() => {
        const buildTextUrl = () => {
            let url = `${API_BASE}/text/${encodeURIComponent(selectedPrompt)}`;
            const urlParams = new URLSearchParams();
            urlParams.append("model", selectedModel);
            // Don't include stream param in actual fetch - just for display
            if (params.size > 0) {
                Array.from(params)
                    .filter((p) => !p.startsWith("stream="))
                    .forEach((p) => {
                        const [key, value] = p.split("=");
                        urlParams.append(key, value);
                    });
            }
            const paramString = urlParams.toString();
            if (paramString) {
                url += "?" + paramString;
            }
            return url;
        };

        const fetchText = async () => {
            setIsLoading(true);
            try {
                const url = buildTextUrl();
                const res = await fetchWithRetry(url, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                const text = await res.text();
                setResponse(text);
            } catch (error) {
                console.error("Text fetch error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchText();
    }, [selectedPrompt, selectedModel, params]);

    return (
        <div>
            <Heading variant="section">{copy.textGenerationTitle}</Heading>

            {/* Prompts/Parameters and Response - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts, Model, and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>{copy.pickPromptLabel}</Label>
                        <div className="flex flex-wrap gap-2">
                            {textPrompts.map(
                                (prompt: string, index: number) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() =>
                                            setSelectedPromptIndex(index)
                                        }
                                        className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                            selectedPromptIndex === index
                                                ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                                : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                        }`}
                                    >
                                        {prompt}
                                    </button>
                                ),
                            )}
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <Label>{copy.modelLabel}</Label>
                        <div className="flex flex-wrap gap-2">
                            {models.slice(0, 6).map((model) => (
                                <button
                                    key={model}
                                    type="button"
                                    onClick={() => setSelectedModel(model)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        selectedModel === model
                                            ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                            : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                    }`}
                                >
                                    {model}
                                </button>
                            ))}
                        </div>
                        <p className="font-body text-xs text-text-caption mt-2">
                            {copy.defaultModelLabel}
                        </p>
                    </div>

                    {/* Parameters */}
                    <div>
                        <Label>{copy.parametersLabel}</Label>
                        <div className="flex flex-wrap gap-2">
                            {copy.textParameters.map(({ key, value }) => {
                                const param = `${key}=${value}`;
                                return (
                                    <button
                                        key={param}
                                        type="button"
                                        onClick={() => toggleParam(param)}
                                        className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                            params.has(param)
                                                ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                                : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                        }`}
                                        title={
                                            copy.textParameters.find(
                                                (p) => p.key === key,
                                            )?.description
                                        }
                                    >
                                        {key}={value}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right side: Response */}
                <div className="bg-surface-card p-3 min-h-[200px] max-h-[200px] overflow-hidden">
                    {isLoading ? (
                        <p className="text-text-caption font-body text-xs">
                            {copy.generatingLabel}
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
                    https://{COPY_CONSTANTS.apiBaseUrl}/text/
                </span>
                <span className="bg-indicator-text px-1 font-black text-text-inverse">
                    {selectedPrompt}
                </span>
                <span className="text-text-caption">?model=</span>
                <span className="bg-indicator-text px-1 font-black text-text-inverse">
                    {selectedModel}
                </span>
                {params.size > 0 && (
                    <>
                        {Array.from(params).map((param) => (
                            <span key={param}>
                                <span className="text-text-caption">&</span>
                                <span className="bg-indicator-text px-1 font-black text-text-inverse">
                                    {param}
                                </span>
                            </span>
                        ))}
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
                {copy.copyUrlButton}
            </Button>
        </div>
    );
}
