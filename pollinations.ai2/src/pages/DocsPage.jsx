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
    "explain pollination",
    "write a poem about nature",
    "describe ecosystem harmony",
    "explain symbiosis",
];

function DocsPage() {
    return (
        <div className="w-full px-4 pb-12">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Intro - Full Width */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
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
                        className="font-body text-offblack/70 text-sm leading-relaxed mb-6"
                    />
                    <div className="flex flex-wrap gap-3">
                        <a
                            href="https://enter.pollinations.ai/api/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-4 py-3 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-xs font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all"
                        >
                            📚 Full API Docs
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                // TODO: Replace with actual AGENTS.md content
                                const agentPrompt = `# Pollinations.AI Agent Prompt\n\nThis is a placeholder for the agent prompt content from AGENTS.md.\n\nThe full content will be added here soon.`;
                                navigator.clipboard.writeText(agentPrompt);
                                alert("Agent prompt copied to clipboard!");
                            }}
                            className="inline-block px-4 py-3 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-xs font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all cursor-pointer"
                        >
                            🤖 Agent Prompt
                        </button>
                    </div>
                </div>

                {/* Image Generation Card */}
                <ImageGenCard />

                {/* Text Generation Card */}
                <TextGenCard />

                {/* Model Discovery */}
                <ModelDiscoveryCard />

                {/* Authentication - Call to Action */}
                <AuthCard />
            </div>
        </div>
    );
}

function AuthCard() {
    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-6 uppercase tracking-wider">
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
                                        <p className="font-headline text-xs font-black text-offblack uppercase mb-1">
                                            Publishable
                                        </p>
                                        <p className="text-xs text-offblack/70">
                                            Client-safe, rate-limited
                                        </p>
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
                                        <p className="font-headline text-xs font-black text-offblack uppercase mb-1">
                                            Secret
                                        </p>
                                        <p className="text-xs text-offblack/70">
                                            Server-only, unlimited
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <a
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all"
                    >
                        <p className="font-headline text-xs uppercase tracking-wider font-black text-offblack mb-2">
                            Get Your Key
                        </p>
                        <p className="font-mono text-sm font-black text-offblack">
                            enter.pollinations.ai →
                        </p>
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
        if (params.size > 0) {
            url += "?" + Array.from(params).join("&");
        }
        return url;
    };

    useEffect(() => {
        const fetchImage = async () => {
            setIsLoading(true);
            try {
                const url = buildUrl();
                const response = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                    },
                });
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
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
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
                {buildUrl()}
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
    const [params, setParams] = useState(new Set());
    const [response, setResponse] = useState("");
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
        let url = `https://enter.pollinations.ai/api/generate/text/${encodeURIComponent(
            selectedPrompt
        )}`;
        if (params.size > 0) {
            url += "?" + Array.from(params).join("&");
        }
        return url;
    };

    useEffect(() => {
        const fetchText = async () => {
            setIsLoading(true);
            try {
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
    }, [selectedPrompt, params]);

    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
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

                    {/* Optional Parameters */}
                    <div>
                        <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                            Optional parameters:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                "model=openai",
                                "model=mistral",
                                "model=claude",
                                "json=true",
                                "seed=123",
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

function ModelDiscoveryCard() {
    const modelEndpoints = {
        image: {
            label: "Image",
            url: "https://enter.pollinations.ai/api/generate/image/models",
            path: "/image/models",
            color: "lime",
        },
        openai: {
            label: "Text (OpenAI)",
            url: "https://enter.pollinations.ai/api/generate/v1/models",
            path: "/v1/models",
            color: "rose",
        },
        simple: {
            label: "Text (Simple)",
            url: "https://enter.pollinations.ai/api/generate/text/models",
            path: "/text/models",
            color: "lime",
        },
    };

    const [selectedModel, setSelectedModel] = useState("image");
    const currentEndpoint = modelEndpoints[selectedModel];

    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
                Model Discovery
            </h2>

            {/* Model Type Selection */}
            <div className="mb-4">
                <p className="font-headline text-xs uppercase tracking-wider font-black mb-2">
                    Select model type:
                </p>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(modelEndpoints).map(
                        ([key, { label, color }]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedModel(key)}
                                className={`px-3 py-1.5 font-mono text-xs border-2 transition-all cursor-pointer ${
                                    selectedModel === key
                                        ? color === "rose"
                                            ? "bg-rose border-offblack font-black shadow-black-sm"
                                            : "bg-lime/90 border-offblack font-black shadow-black-sm"
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
            <div className="mb-4 p-3 bg-offblack/5 font-mono text-xs break-all">
                <span className="text-offblack/40">
                    https://enter.pollinations.ai/api/generate
                </span>
                <span
                    className={`px-1 font-black ${
                        currentEndpoint.color === "rose"
                            ? "bg-rose/90 text-offwhite"
                            : "bg-lime/90"
                    }`}
                >
                    {currentEndpoint.path}
                </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
                <a
                    href={currentEndpoint.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-block px-4 py-2 border-2 font-headline uppercase text-xs font-black transition-all ${
                        currentEndpoint.color === "rose"
                            ? "bg-rose border-offblack hover:shadow-black-md"
                            : "bg-lime/90 border-offblack hover:shadow-black-md"
                    }`}
                >
                    Open API →
                </a>
                <button
                    type="button"
                    onClick={() =>
                        navigator.clipboard.writeText(currentEndpoint.url)
                    }
                    className="px-4 py-2 bg-offblack border-2 border-offblack font-headline uppercase text-xs font-black text-offwhite hover:shadow-black-md transition-all"
                >
                    Copy URL
                </button>
            </div>
        </div>
    );
}

export default DocsPage;
