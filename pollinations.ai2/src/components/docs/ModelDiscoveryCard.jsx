import { useState, useEffect } from "react";
import { Heading, Label } from "../ui/typography";
import { Button } from "../ui/button";

/**
 * Model Discovery Card Component
 * Displays available models from different endpoints
 */
export function ModelDiscoveryCard() {
    const modelEndpoints = {
        image: {
            label: "Image",
            url: "https://enter.pollinations.ai/api/generate/image/models",
            path: "/image/models",
        },
        text: {
            label: "Text",
            url: "https://enter.pollinations.ai/api/generate/text/models",
            path: "/text/models",
        },
        openai: {
            label: "Text (OpenAI)",
            url: "https://enter.pollinations.ai/api/generate/v1/models",
            path: "/v1/models",
        },
    };

    const [selectedModel, setSelectedModel] = useState("image");
    const [modelsData, setModelsData] = useState(null);
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
            <Heading variant="section">Model Discovery</Heading>

            {/* Model Type Selection and Output - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Controls */}
                <div className="space-y-4">
                    {/* Model Type Selection */}
                    <div>
                        <Label>Select a type</Label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(modelEndpoints).map(
                                ([key, { label }]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSelectedModel(key)}
                                        className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                            selectedModel === key
                                                ? "bg-lime/90 border-rose font-black shadow-[2px_2px_0px_0px_rgba(255,105,180,1)]"
                                                : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {/* URL Display */}
                    <div className="p-3 bg-offblack/5 font-mono text-xs break-all">
                        <span className="text-offblack/40">
                            https://enter.pollinations.ai/api/generate
                        </span>
                        <span className="bg-lime/90 px-1 font-black">
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
                        Copy URL
                    </Button>
                </div>

                {/* Right side: Models JSON Output - Fixed Height */}
                <div className="bg-offblack/5 p-3 font-mono text-xs text-offblack h-48 overflow-auto scrollbar-hide">
                    {isLoading ? (
                        <div className="text-offblack/50">
                            Loading models...
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
