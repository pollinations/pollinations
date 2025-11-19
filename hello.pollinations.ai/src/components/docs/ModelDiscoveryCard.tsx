import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";
import { TextGenerator } from "../TextGenerator";
import { DOCS_PAGE } from "../../config/content";

/**
 * Model Discovery Card Component
 * Displays available models from different endpoints
 */
export function ModelDiscoveryCard() {
    const modelEndpoints = {
        image: {
            label: DOCS_PAGE.imageTypeLabel.text,
            url: "https://enter.pollinations.ai/api/generate/image/models",
            path: "/image/models",
        },
        text: {
            label: DOCS_PAGE.textTypeLabel.text,
            url: "https://enter.pollinations.ai/api/generate/text/models",
            path: "/text/models",
        },
        openai: {
            label: DOCS_PAGE.textOpenAITypeLabel.text,
            url: "https://enter.pollinations.ai/api/generate/v1/models",
            path: "/v1/models",
        },
    };

    const [selectedModel, setSelectedModel] =
        useState<keyof typeof modelEndpoints>("image");
    const [modelsData, setModelsData] = useState<any>(null);
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
                <TextGenerator content={DOCS_PAGE.modelDiscoveryTitle} />
            </Heading>

            {/* Model Type Selection and Output - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Controls */}
                <div className="space-y-4">
                    {/* Model Type Selection */}
                    <div>
                        <Label>
                            <TextGenerator
                                content={DOCS_PAGE.selectTypeLabel}
                            />
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(modelEndpoints).map(
                                ([key, { label }]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() =>
                                            setSelectedModel(
                                                key as keyof typeof modelEndpoints
                                            )
                                        }
                                        className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                            selectedModel === key
                                                ? "bg-yellow border-pink font-black shadow-pink-sm"
                                                : "bg-gray-ultra-light border-gray hover:border-pink"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {/* URL Display */}
                    <div className="p-3 bg-gray-ultra-light font-mono text-xs break-all">
                        <span className="text-gray">
                            https://enter.pollinations.ai/api/generate
                        </span>
                        <span className="bg-yellow px-1 font-black">
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
                        <TextGenerator content={DOCS_PAGE.copyUrlButton} />
                    </Button>
                </div>

                {/* Right side: Models JSON Output - Fixed Height */}
                <div className="bg-gray-medium p-3 font-mono text-xs text-charcoal h-48 overflow-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="text-gray">
                            <TextGenerator
                                content={DOCS_PAGE.loadingModelsLabel}
                            />
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
