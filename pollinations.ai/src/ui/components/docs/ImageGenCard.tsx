import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";
import { DOCS_PAGE } from "../../../theme";
import { API_BASE, API_KEY } from "../../../api.config";
import { ALLOWED_IMAGE_MODELS } from "../../../config/allowedModels";
import { fetchWithRetry } from "../../../utils/fetchWithRetry";

/**
 * Image Generation Card Component
 * Interactive demo for the image generation API
 */
export function ImageGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(
        DOCS_PAGE.imagePrompts[0]
    );
    const [selectedModel, setSelectedModel] = useState("flux");
    const [params, setParams] = useState<Set<string>>(new Set());
    const [imageUrl, setImageUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);

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
        let url = `${API_BASE}/image/${encodeURIComponent(selectedPrompt)}`;
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
        const buildImageUrl = () => {
            let url = `${API_BASE}/image/${encodeURIComponent(selectedPrompt)}`;
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

        const fetchImage = async () => {
            setIsLoading(true);
            try {
                const url = buildImageUrl();
                const response = await fetchWithRetry(url, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setImageUrl(imageURL);
            } catch (error) {
                console.error("Image fetch error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchImage();
    }, [selectedPrompt, selectedModel, params]);

    // Cleanup blob URLs
    useEffect(() => {
        return () => {
            if (imageUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    return (
        <div>
            <Heading variant="section">
                {DOCS_PAGE.imageGenerationTitle.text}
            </Heading>

            {/* Prompts/Parameters and Image Preview - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts, Model, and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <Label>{DOCS_PAGE.pickPromptLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            {DOCS_PAGE.imagePrompts.map((prompt) => (
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
                        <Label>{DOCS_PAGE.modelSelectLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            {ALLOWED_IMAGE_MODELS.map((model) => (
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
                    </div>

                    {/* Parameters */}
                    <div>
                        <Label>{DOCS_PAGE.parametersLabel.text}</Label>
                        <div className="flex flex-wrap gap-2">
                            {DOCS_PAGE.imageParameters.map(({ key, value }) => {
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
                                            DOCS_PAGE.imageParameters.find(
                                                (p) => p.key === key
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

                {/* Right side: Image Preview (no label) */}
                <div className="bg-input-background flex items-center justify-center min-h-[240px] max-w-[300px] max-h-[300px] overflow-hidden">
                    {isLoading ? (
                        <p className="text-text-caption text-xs">
                            {DOCS_PAGE.generatingLabel.text}
                        </p>
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={selectedPrompt}
                            className="w-full h-full object-cover max-w-[300px] max-h-[300px]"
                        />
                    ) : null}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-input-background font-mono text-xs text-text-body-main break-all">
                <span className="text-text-caption">
                    https://{DOCS_PAGE.apiBaseUrl.text}/image/
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
                {DOCS_PAGE.copyUrlButton.text}
            </Button>
        </div>
    );
}
