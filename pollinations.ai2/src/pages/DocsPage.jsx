import { useState, useEffect } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { DOCS_INTRO, DOCS_API_REFERENCE } from "../config/content";

const API_KEY = "plln_sk_2d1YAgFDvIjAKPZ1mOFVCGiYNTluWhmc";

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
                {/* Intro Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
                    <TextGenerator
                        text={DOCS_INTRO}
                        seed={77777}
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed mb-4"
                    />
                    <TextGenerator
                        text={DOCS_API_REFERENCE}
                        seed={88888}
                        as="div"
                        className="font-body text-offblack/70 text-sm leading-relaxed mb-4"
                    />
                    <div className="flex flex-wrap gap-3">
                        <a
                            href="https://enter.pollinations.ai/api/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all"
                        >
                            Full API Docs
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                // TODO: Replace with actual AGENTS.md content
                                const agentPrompt = `# Pollinations.AI Agent Prompt\n\nThis is a placeholder for the agent prompt content from AGENTS.md.\n\nThe full content will be added here soon.`;
                                navigator.clipboard.writeText(agentPrompt);
                                alert("Agent prompt copied to clipboard!");
                            }}
                            className="inline-block px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all cursor-pointer"
                        >
                            Agent Prompt 📋
                        </button>
                    </div>
                </div>

                {/* Auth & Model Discovery - Side by Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <AuthCard />
                    <ModelDiscoveryCard />
                </div>

                {/* Image Generation Card */}
                <ImageGenCard />

                {/* Text Generation Card */}
                <TextGenCard />
            </div>
        </div>
    );
}

function AuthCard() {
    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
                🔑 Authentication
            </h2>
            <div className="space-y-4 font-body text-offblack/80">
                <p>
                    Get your API key at{" "}
                    <a
                        href="https://enter.pollinations.ai"
                        className="text-offblack font-black underline hover:text-rose transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        enter.pollinations.ai
                    </a>
                </p>

                <div>
                    <p className="font-black mb-2">Key Types:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>
                            <span className="font-mono bg-lime/30 px-1">
                                pk_
                            </span>{" "}
                            Publishable (client-safe, rate-limited)
                        </li>
                        <li>
                            <span className="font-mono bg-lime/30 px-1">
                                sk_
                            </span>{" "}
                            Secret (server-only, unlimited)
                        </li>
                    </ul>
                </div>

                <div>
                    <p className="font-black mb-2">Usage:</p>
                    <div className="font-mono text-xs bg-offblack/5 p-3 space-y-1">
                        <div>Header: Authorization: Bearer YOUR_KEY</div>
                        <div>Or: ?key=YOUR_KEY</div>
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
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
                🎨 Image Generation
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
                                            ? "bg-lime/90 border-rose font-black shadow-[2px_2px_0px_0px_rgba(255,105,180,1)]"
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
                                "model=flux",
                                "model=turbo",
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
                                            ? "bg-lime/90 border-rose font-black shadow-[2px_2px_0px_0px_rgba(255,105,180,1)]"
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
                className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all"
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
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
                💬 Text Generation
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
                                            ? "bg-lime/90 border-rose font-black shadow-[2px_2px_0px_0px_rgba(255,105,180,1)]"
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
                                            ? "bg-lime/90 border-rose font-black shadow-[2px_2px_0px_0px_rgba(255,105,180,1)]"
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
                className="px-4 py-2 bg-lime/90 border-2 border-rose font-headline uppercase text-xs font-black hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all"
            >
                Copy URL
            </button>
        </div>
    );
}

function ModelDiscoveryCard() {
    return (
        <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
            <h2 className="font-headline text-2xl font-black text-offblack mb-4 uppercase tracking-wider">
                📚 Model Discovery
            </h2>
            <div className="space-y-4 font-body text-offblack/80">
                <div>
                    <p className="font-black mb-2">Image Models:</p>
                    <a
                        href="https://enter.pollinations.ai/api/generate/image/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block font-mono text-xs bg-offblack/5 px-3 py-2 hover:bg-lime/30 transition-colors border-b-2 border-transparent hover:border-rose"
                    >
                        /api/generate/image/models
                    </a>
                </div>

                <div>
                    <p className="font-black mb-2">Text Models (OpenAI):</p>
                    <a
                        href="https://enter.pollinations.ai/api/generate/v1/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block font-mono text-xs bg-offblack/5 px-3 py-2 hover:bg-lime/30 transition-colors border-b-2 border-transparent hover:border-rose"
                    >
                        /api/generate/v1/models
                    </a>
                </div>

                <div>
                    <p className="font-black mb-2">Text Models (Simple):</p>
                    <a
                        href="https://enter.pollinations.ai/api/generate/text/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block font-mono text-xs bg-offblack/5 px-3 py-2 hover:bg-lime/30 transition-colors border-b-2 border-transparent hover:border-rose"
                    >
                        /api/generate/text/models
                    </a>
                </div>
            </div>
        </div>
    );
}

export default DocsPage;
