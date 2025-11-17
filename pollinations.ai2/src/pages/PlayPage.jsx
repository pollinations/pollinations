import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { TextGenerator } from "../components/TextGenerator";
import { PLAY_DESCRIPTION, FEED_DESCRIPTION } from "../config/content";
import { ImageFeed } from "../components/ImageFeed";

// API key for authenticated requests (secret key for local dev)
const API_KEY = "plln_sk_2d1YAgFDvIjAKPZ1mOFVCGiYNTluWhmc";

function PlayPage() {
    const [view, setView] = useState("play"); // "play" or "feed"
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState("flux");
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Cleanup blob URLs when result changes
    useEffect(() => {
        return () => {
            if (result && result.startsWith("blob:")) {
                URL.revokeObjectURL(result);
            }
        };
    }, [result]);

    // Image parameters
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [enhance, setEnhance] = useState(false);
    const [nologo, setNologo] = useState(true);

    // Real models from enter.pollinations.ai API
    const imageModels = [
        { id: "flux", name: "Flux" },
        { id: "kontext", name: "Kontext" },
        { id: "turbo", name: "Turbo" },
        { id: "seedream", name: "SeeDream" },
        { id: "nanobanana", name: "Nano Banana" },
        { id: "gptimage", name: "GPT Image" },
    ];

    const textModels = [
        { id: "openai", name: "GPT-5 Nano" },
        { id: "openai-large", name: "GPT-4.1" },
        { id: "claude-large", name: "Claude Sonnet 4.5" },
        { id: "gemini", name: "Gemini 2.5" },
        { id: "deepseek", name: "DeepSeek V3.1" },
        { id: "grok", name: "Grok 4" },
        { id: "mistral", name: "Mistral Small" },
        { id: "mistral-fast", name: "Llama 3.1 8B" },
    ];

    const allModels = [...imageModels, ...textModels];

    const isImageModel = imageModels.some((m) => m.id === model);

    const handleGenerate = async () => {
        setIsLoading(true);

        if (isImageModel) {
            try {
                const params = new URLSearchParams({
                    model,
                    width,
                    height,
                    seed: seed || Date.now(),
                    enhance: enhance.toString(),
                    nologo: nologo.toString(),
                });

                const response = await fetch(
                    `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(
                        prompt
                    )}?${params}`,
                    {
                        headers: {
                            Authorization: `Bearer ${API_KEY}`,
                        },
                    }
                );

                const blob = await response.blob();
                const imageURL = URL.createObjectURL(blob);
                setResult(imageURL);
                setIsLoading(false);
            } catch (error) {
                console.error("Image generation error:", error);
                setIsLoading(false);
            }
        } else {
            // Text generation - will implement
            fetch(
                `https://text.pollinations.ai/${encodeURIComponent(
                    prompt
                )}?model=${model}`
            )
                .then((res) => res.text())
                .then((text) => {
                    setResult(text);
                    setIsLoading(false);
                })
                .catch(() => setIsLoading(false));
        }
    };

    return (
        <div className="w-full px-4">
            <div className="max-w-4xl mx-auto">
                {/* Big Play Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
                    {/* Introduction */}
                    <div className="mb-8">
                        <div className="flex items-center gap-4 mb-3">
                            <h1 className="font-title text-4xl md:text-5xl font-black text-offblack">
                                {view === "play" ? "Create" : "Watch"}
                            </h1>
                            <button
                                type="button"
                                onClick={() =>
                                    setView(view === "play" ? "feed" : "play")
                                }
                                className="font-body text-sm text-offblack/40 hover:text-offblack/70 transition-colors whitespace-nowrap"
                            >
                                {view === "play"
                                    ? "Watch what others are making"
                                    : "Back to Play"}
                            </button>
                        </div>
                        <TextGenerator
                            text={
                                view === "play"
                                    ? PLAY_DESCRIPTION
                                    : FEED_DESCRIPTION
                            }
                            seed={view === "play" ? 12345 : 54321}
                            as="div"
                            className="font-body text-offblack/70 text-base leading-relaxed"
                        />
                    </div>

                    {/* Content: Play Interface or Feed */}
                    {view === "play" ? (
                        <>
                            {/* Prompt Input */}
                            <div className="mb-6">
                                <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                    Prompt
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={
                                        isImageModel
                                            ? "Describe the image you want..."
                                            : "Enter your question or prompt..."
                                    }
                                    className="w-full p-4 bg-offblack/5 text-offblack font-body resize-none focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                                    rows={4}
                                />
                            </div>

                            {/* Model Selector */}
                            <div className="mb-6">
                                <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                    Model
                                </label>
                                <select
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    className="w-full p-4 bg-offblack/5 text-offblack font-headline uppercase text-xs tracking-wider font-black focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                                >
                                    {allModels.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Image Parameters (only show for image models) */}
                            {isImageModel && (
                                <div className="mb-6">
                                    {/* Responsive auto-fill grid: fills rows completely */}
                                    <div
                                        className="grid gap-3"
                                        style={{
                                            gridTemplateColumns:
                                                "repeat(auto-fit, minmax(120px, 1fr))",
                                        }}
                                    >
                                        <div>
                                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                                Width
                                            </label>
                                            <input
                                                type="number"
                                                value={width}
                                                onChange={(e) =>
                                                    setWidth(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                                Height
                                            </label>
                                            <input
                                                type="number"
                                                value={height}
                                                onChange={(e) =>
                                                    setHeight(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                                Seed
                                            </label>
                                            <input
                                                type="number"
                                                value={seed}
                                                onChange={(e) =>
                                                    setSeed(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                placeholder="0 = random"
                                                className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 hover:bg-offblack/10 transition-colors placeholder:text-offblack/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                                Enhance
                                            </label>
                                            <label className="relative flex items-center justify-center h-[52px] bg-offblack/5 hover:bg-offblack/10 transition-colors cursor-pointer select-none group">
                                                <input
                                                    type="checkbox"
                                                    checked={enhance}
                                                    onChange={(e) =>
                                                        setEnhance(
                                                            e.target.checked
                                                        )
                                                    }
                                                    className="sr-only peer"
                                                />
                                                <div className="w-6 h-6 border-4 border-rose bg-offblack/5 peer-checked:bg-lime transition-colors group-hover:border-rose" />
                                                <svg
                                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-offblack opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="square"
                                                        strokeLinejoin="miter"
                                                        strokeWidth="4"
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                                Logo
                                            </label>
                                            <label className="relative flex items-center justify-center h-[52px] bg-offblack/5 hover:bg-offblack/10 transition-colors cursor-pointer select-none group">
                                                <input
                                                    type="checkbox"
                                                    checked={nologo}
                                                    onChange={(e) =>
                                                        setNologo(
                                                            e.target.checked
                                                        )
                                                    }
                                                    className="sr-only peer"
                                                />
                                                <div className="w-6 h-6 border-4 border-rose bg-offblack/5 peer-checked:bg-lime transition-colors group-hover:border-rose" />
                                                <svg
                                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-offblack opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="square"
                                                        strokeLinejoin="miter"
                                                        strokeWidth="4"
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Generate Button */}
                            <Button
                                variant="brutal"
                                size="lg"
                                onClick={handleGenerate}
                                disabled={!prompt || isLoading}
                                className="w-full mb-6"
                            >
                                {isLoading
                                    ? "Generating..."
                                    : `Generate ${
                                          isImageModel ? "Image" : "Text"
                                      }`}
                            </Button>

                            {/* Result Display */}
                            {result && (
                                <div
                                    className={
                                        isImageModel ? "" : "bg-offblack/5 p-6"
                                    }
                                >
                                    {isImageModel ? (
                                        <img
                                            src={result}
                                            alt="Generated"
                                            className="w-full h-auto"
                                            onLoad={() => setIsLoading(false)}
                                        />
                                    ) : (
                                        <div className="font-body text-offblack whitespace-pre-wrap">
                                            {result}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <ImageFeed />
                    )}
                </div>
            </div>
        </div>
    );
}

export default PlayPage;
