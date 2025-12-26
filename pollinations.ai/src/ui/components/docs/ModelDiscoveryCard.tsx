import { useEffect, useState } from "react";
import { getText } from "../../../copy";
import { DOCS_PAGE } from "../../../copy/content/docs";
import { useCopy } from "../../contexts/CopyContext";
import { Button } from "../ui/button";
import { Heading, Label } from "../ui/typography";

/**
 * Model Discovery Card Component
 * Displays available models from different endpoints
 */
export function ModelDiscoveryCard() {
    // Get translated copy
    const { processedCopy } = useCopy();
    const copy = (
        processedCopy?.modelDiscoveryTitle ? processedCopy : DOCS_PAGE
    ) as typeof DOCS_PAGE;

    const apiBase = `https://${getText(copy.apiBaseUrl)}`;
    const modelEndpoints = {
        image: {
            label: getText(copy.imageTypeLabel),
            url: `${apiBase}/image/models`,
            path: "/image/models",
        },
        text: {
            label: getText(copy.textTypeLabel),
            url: `${apiBase}/text/models`,
            path: "/text/models",
        },
        openai: {
            label: getText(copy.textOpenAITypeLabel),
            url: `${apiBase}/v1/models`,
            path: "/v1/models",
        },
    };

    const [selectedModel, setSelectedModel] =
        useState<keyof typeof modelEndpoints>("image");
    const [modelsData, setModelsData] = useState<unknown>(null);
    const [isLoading, setIsLoading] = useState(false);
    const currentEndpoint = modelEndpoints[selectedModel];

    useEffect(() => {
        const fetchModels = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(currentEndpoint.url);
                const data = await response.json();
                setModelsData(data);
                setIsLoading(false);
            } catch (error) {
                console.error("Models fetch error:", error);
                setModelsData({ error: "Failed to load models" });
                setIsLoading(false);
            }
        };

        fetchModels();
    }, [currentEndpoint.url]);

    return (
        <div>
            <Heading variant="section">
                {getText(copy.modelDiscoveryTitle)}
            </Heading>

            {/* Model Type Selection and Output - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Controls */}
                <div className="space-y-4">
                    {/* Model Type Selection */}
                    <div>
                        <Label>{getText(copy.selectTypeLabel)}</Label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(modelEndpoints).map(
                                ([key, { label }]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() =>
                                            setSelectedModel(
                                                key as keyof typeof modelEndpoints,
                                            )
                                        }
                                        className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                            selectedModel === key
                                                ? "bg-indicator-text border-border-brand font-black shadow-shadow-brand-sm text-text-inverse"
                                                : "bg-input-background border-border-main hover:border-border-brand text-text-body-main"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ),
                            )}
                        </div>
                    </div>

                    {/* URL Display */}
                    <div className="p-3 bg-input-background font-mono text-xs text-text-body-main break-all">
                        <span className="text-text-caption">
                            https://{getText(copy.apiBaseUrl)}
                        </span>
                        <span className="bg-indicator-text px-1 font-black text-text-inverse">
                            {currentEndpoint.path}
                        </span>
                    </div>

                    {/* Copy Button */}
                    <Button
                        type="button"
                        onClick={() =>
                            navigator.clipboard.writeText(currentEndpoint.url)
                        }
                        variant="copy"
                        size={null}
                    >
                        {getText(copy.copyUrlButton)}
                    </Button>
                </div>

                {/* Right side: Models JSON Output - Fixed Height */}
                <div className="bg-surface-card p-3 font-mono text-xs text-text-body-main h-48 overflow-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="text-text-caption">
                            {getText(copy.loadingModelsLabel)}
                        </div>
                    ) : modelsData ? (
                        <pre className="whitespace-pre-wrap break-words">
                            {JSON.stringify(modelsData, null, 2)}
                        </pre>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
