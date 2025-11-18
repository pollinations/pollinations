import { useState, useEffect } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { DOCS_INTRO, DOCS_API_REFERENCE } from "../config/content";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

// Nature-themed prompt presets
const IMAGE_PROMPTS = [
    "a blooming flower in golden hour",
    "bees pollinating wildflowers",
    "organic mycelium network patterns",
    "harmonious forest ecosystem",
    "symbiotic nature interactions",
    "flowing river through biosphere",
];

const TEXT_PROMPTS = [
    "explain pollinations.ai",
    "write a poem about nature",
    "describe ecosystem harmony",
    "explain symbiosis",
];

function DocsPage() {
    const [agentPromptCopied, setAgentPromptCopied] = useState(false);

    return (
        <div className="w-full px-4 pb-12">
            <div className="max-w-4xl mx-auto">
                {/* One Big Card containing everything */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
                    {/* Title */}
                    <h1 className="font-title text-4xl md:text-5xl font-black text-offblack mb-6">
                        Integrate
                    </h1>

                    {/* Intro */}
                    <TextGenerator
                        text={DOCS_INTRO.prompt}
                        seed={DOCS_INTRO.seed}
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed mb-4"
                    />
                    <TextGenerator
                        text={DOCS_API_REFERENCE.prompt}
                        seed={DOCS_API_REFERENCE.seed}
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed mb-6"
                    />
                    <div className="flex flex-wrap gap-3 mb-12">
                        <a
                            href="https://enter.pollinations.ai/api/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all"
                        >
                            Full API Docs
                            <svg
                                className="w-3.5 h-3.5 stroke-offblack"
                                fill="none"
                                strokeWidth="2.5"
                                viewBox="0 0 12 12"
                            >
                                <path
                                    d="M1 11L11 1M11 1H4M11 1v7"
                                    strokeLinecap="square"
                                />
                            </svg>
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                // TODO: Replace with actual AGENTS.md content
                                const agentPrompt = `# Pollinations.AI Agent Prompt\n\nThis is a placeholder for the agent prompt content from AGENTS.md.\n\nThe full content will be added here soon.`;
                                navigator.clipboard.writeText(agentPrompt);
                                setAgentPromptCopied(true);
                                setTimeout(
                                    () => setAgentPromptCopied(false),
                                    2000
                                );
                            }}
                            className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all cursor-pointer relative"
                        >
                            Agent Prompt
                            <svg
                                className="w-4 h-4 stroke-offwhite"
                                fill="none"
                                strokeWidth="2"
                                viewBox="0 0 16 16"
                            >
                                <rect
                                    x="5"
                                    y="5"
                                    width="9"
                                    height="9"
                                    strokeLinecap="square"
                                />
                                <path
                                    d="M11 5V3H3v8h2"
                                    strokeLinecap="square"
                                />
                            </svg>
                            {agentPromptCopied && (
                                <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                    Copied!
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Image Generation */}
                    <ImageGenCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Text Generation */}
                    <TextGenCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Model Discovery */}
                    <ModelDiscoveryCard />

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Authentication */}
                    <AuthCard />
                </div>
            </div>
        </div>
    );
}

function AuthCard() {
    return (
        <div>
            <h2 className="font-headline text-2xl md:text-3xl font-black text-offblack mb-6 uppercase tracking-widest border-l-4 border-rose pl-4">
                Authentication
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Key Types + Get Your Key */}
                <div className="space-y-4">
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black text-offblack mb-3">
                            Key Types
                        </p>
                        <div className="space-y-3">
                            {/* Publishable Key */}
                            <div className="bg-offblack/5 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-lime">
                                        pk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-offblack uppercase mb-2">
                                            Publishable
                                        </p>
                                        <ul className="text-xs text-offblack/70 space-y-1">
                                            <li>Safe for client-side code</li>
                                            <li>1 pollen/hour per IP+key</li>
                                            <li className="text-rose font-bold">
                                                Beta: Use secret keys for
                                                production
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Secret Key */}
                            <div className="bg-offblack/5 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-rose">
                                        sk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-offblack uppercase mb-2">
                                            Secret
                                        </p>
                                        <ul className="text-xs text-offblack/70 space-y-1">
                                            <li>Server-side only</li>
                                            <li>Never expose publicly</li>
                                            <li>No rate limits</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <a
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all"
                    >
                        <p className="font-headline text-xs uppercase tracking-wider font-black text-offwhite mb-2">
                            Get Your Key
                        </p>
                        <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-black text-lime">
                                enter.pollinations.ai
                            </p>
                            <svg
                                className="w-3 h-3 stroke-lime"
                                fill="none"
                                strokeWidth="2.5"
                                viewBox="0 0 12 12"
                            >
                                <path
                                    d="M1 11L11 1M11 1H4M11 1v7"
                                    strokeLinecap="square"
                                />
                            </svg>
                        </div>
                    </a>
                </div>

                {/* Right: Usage Examples */}
                <div>
                    <p className="font-headline text-xs uppercase tracking-wider font-black text-offblack mb-3">
                        Usage Examples
                    </p>

                    {/* Header Method */}
                    <div className="mb-4">
                        <p className="font-body text-xs text-offblack/70 mb-2">
                            <span className="font-black">
                                Server-side (Recommended):
                            </span>{" "}
                            Use secret key in Authorization header
                        </p>
                        <div className="font-mono text-xs bg-offblack text-offwhite p-4 border-r-4 border-b-4 border-offblack/50">
                            <div className="text-lime/80">
                                {"// Example with fetch"}
                            </div>
                            <div className="mt-2">{"fetch(url, {"}</div>
                            <div className="pl-4">{"  headers: {"}</div>
                            <div className="pl-8">
                                <span className="text-rose">
                                    {'"Authorization"'}
                                </span>
                                :{" "}
                                <span className="text-lime">
                                    {'"Bearer sk_..."'}
                                </span>
                            </div>
                            <div className="pl-4">{"  }"}</div>
                            <div className="pl-4">{"});"}</div>
                        </div>
                    </div>

                    {/* Query Method */}
                    <div>
                        <p className="font-body text-xs text-offblack/70 mb-2">
                            <span className="font-black">
                                Client-side (Public):
                            </span>{" "}
                            Use publishable key in query parameter
                        </p>
                        <div className="font-mono text-xs bg-offblack text-offwhite p-4 border-r-4 border-b-4 border-offblack/50">
                            <div className="text-lime/80">
                                {"// Add to URL"}
                            </div>
                            <div className="mt-2">
                                {"https://enter.pollinations.ai/..."}
                            </div>
                            <div className="pl-4">
                                <span className="text-rose">{"?key="}</span>
                                <span className="text-lime">{"pk_..."}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ImageGenCard() {
    const [selectedPrompt, setSelectedPrompt] = useState(IMAGE_PROMPTS[0]);
    const [params, setParams] = useState(new Set());
    const [imageUrl, setImageUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const toggleParam = (param) => {
        const newParams = new Set(params);
        if (newParams.has(param)) {
            newParams.delete(param);
        } else {
            newParams.add(param);
        }
        setParams(newParams);
    };

    const buildUrl = () => {
        let url = `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
            selectedPrompt
        )}`;
        const urlParams = new URLSearchParams();
        if (params.size > 0) {
            Array.from(params).forEach((p) => {
                const [key, value] = p.split("=");
                urlParams.append(key, value);
            });
        }
        // Add default model if not specified
        if (!Array.from(params).some((p) => p.startsWith("model="))) {
            urlParams.append("model", "flux");
        }
        const paramString = urlParams.toString();
        if (paramString) {
            url += "?" + paramString;
        }
        return url;
    };

    useEffect(() => {
        const fetchImage = async () => {
            setIsLoading(true);
            try {
                const url = buildUrl();
                console.log("Fetching image from:", url);
                const response = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                    },
                });
                console.log("Response status:", response.status);
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`
                    );
                }
                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setImageUrl(imageURL);
                setIsLoading(false);
            } catch (error) {
                console.error("Image fetch error:", error);
                setIsLoading(false);
            }
        };

        fetchImage();
    }, [selectedPrompt, params]);

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
            <h2 className="font-headline text-2xl md:text-3xl font-black text-offblack mb-4 uppercase tracking-widest border-l-4 border-rose pl-4">
                Image Generation
            </h2>

            {/* Prompts/Parameters and Image Preview - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Pick a prompt:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {IMAGE_PROMPTS.map((prompt) => (
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

                    {/* Optional Parameters */}
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Optional parameters:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                "model=nanobanana",
                                "width=1024",
                                "height=1024",
                                "seed=42",
                                "enhance=true",
                                "nologo=true",
                            ].map((param) => (
                                <button
                                    key={param}
                                    type="button"
                                    onClick={() => toggleParam(param)}
                                    className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                        params.has(param)
                                            ? "bg-lime/90 border-rose font-black shadow-rose-sm"
                                            : "bg-offblack/10 border-offblack/30 hover:border-rose"
                                    }`}
                                >
                                    {param}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right side: Image Preview (no label) */}
                <div className="bg-offblack/5 p-3 flex items-center justify-center min-h-[300px]">
                    {isLoading ? (
                        <p className="text-offblack/50 text-xs">
                            Generating...
                        </p>
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={selectedPrompt}
                            className="w-full h-auto object-contain"
                        />
                    ) : null}
                </div>
            </div>

            {/* URL Display */}
            <div className="mb-4 p-3 bg-offblack/5 font-mono text-xs break-all">
                <span className="text-offblack/40">
                    https://enter.pollinations.ai/api/generate/image/
                </span>
                <span className="bg-lime/90 px-1 font-black">
                    {selectedPrompt}
                </span>
                {params.size > 0 && (
                    <>
                        <span className="text-offblack/40">?</span>
                        {Array.from(params).map((param, i) => (
                            <span key={param}>
                                {i > 0 && (
                                    <span className="text-offblack/40">&</span>
                                )}
                                <span className="bg-lime/90 px-1 font-black">
                                    {param}
                                </span>
                            </span>
                        ))}
                    </>
                )}
            </div>

            {/* Copy Button */}
            <button
                type="button"
                onClick={() => navigator.clipboard.writeText(buildUrl())}
                className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-rose-md transition-all"
            >
                Copy URL
            </button>
        </div>
    );
}

function TextGenCard() {
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
        const fetchText = async () => {
            setIsLoading(true);
            try {
                // Use GET to /api/generate/text/{prompt}
                const url = buildUrl();
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
            <h2 className="font-headline text-2xl md:text-3xl font-black text-offblack mb-4 uppercase tracking-widest border-l-4 border-rose pl-4">
                Text Generation
            </h2>

            {/* Prompts/Parameters and Response - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Prompts and Parameters */}
                <div className="space-y-4">
                    {/* Prompt Selection */}
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Pick a prompt:
                        </p>
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
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Model:
                        </p>
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
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Optional:
                        </p>
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
            <button
                type="button"
                onClick={() => navigator.clipboard.writeText(buildUrl())}
                className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-rose-md transition-all"
            >
                Copy URL
            </button>
        </div>
    );
}

function ModelDiscoveryCard() {
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
    }, [selectedModel, currentEndpoint.url]);

    return (
        <div>
            <h2 className="font-headline text-2xl md:text-3xl font-black text-offblack mb-4 uppercase tracking-widest border-l-4 border-rose pl-4">
                Model Discovery
            </h2>

            {/* Model Type Selection and Output - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Left side: Controls */}
                <div className="space-y-4">
                    {/* Model Type Selection */}
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Select a type:
                        </p>
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
                    <button
                        type="button"
                        onClick={() =>
                            navigator.clipboard.writeText(currentEndpoint.url)
                        }
                        className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-rose-md transition-all"
                    >
                        Copy URL
                    </button>
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

export default DocsPage;
