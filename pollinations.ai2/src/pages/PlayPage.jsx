import { useState } from "react";
import { Button } from "../components/ui/button";

function PlayPage() {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState("flux");
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

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

    const handleGenerate = () => {
        setIsLoading(true);

        if (isImageModel) {
            const params = new URLSearchParams({
                model,
                width,
                height,
                seed: seed || Date.now(), // Random if 0
                enhance: enhance.toString(),
                nologo: nologo.toString(),
            });
            const imageURL = `https://image.pollinations.ai/prompt/${encodeURIComponent(
                prompt
            )}?${params}`;
            setResult(imageURL);
            setIsLoading(false);
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
        <div className="w-full min-h-screen bg-offwhite/80 pt-20 pb-24 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Big Play Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
                    {/* Introduction */}
                    <div className="mb-8">
                        <h1 className="font-title text-4xl md:text-5xl font-black text-offblack mb-3">
                            Play
                        </h1>
                        <p className="font-body text-offblack/70 text-base leading-relaxed">
                            Generate images and text with our free AI API.
                            Choose a model, enter your prompt, and create
                            amazing content instantly. No sign-up required.
                        </p>
                    </div>

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
                            className="w-full p-4 bg-offblack/5 text-offblack font-body resize-none focus:outline-none focus:bg-offblack/10 transition-colors"
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
                            className="w-full p-4 bg-offblack/5 text-offblack font-headline uppercase text-xs tracking-wider font-black focus:outline-none focus:bg-offblack/10 transition-colors"
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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div>
                                <label className="block font-headline text-offblack mb-2 uppercase text-xs tracking-wider font-black">
                                    Width
                                </label>
                                <input
                                    type="number"
                                    value={width}
                                    onChange={(e) =>
                                        setWidth(Number(e.target.value))
                                    }
                                    className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 transition-colors"
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
                                        setHeight(Number(e.target.value))
                                    }
                                    className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 transition-colors"
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
                                        setSeed(Number(e.target.value))
                                    }
                                    placeholder="0 = random"
                                    className="w-full p-3 bg-offblack/5 text-offblack font-body focus:outline-none focus:bg-offblack/10 transition-colors placeholder:text-offblack/40"
                                />
                            </div>
                            <div className="flex flex-col gap-2 justify-center">
                                <label className="flex items-center gap-2 font-body text-offblack cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={enhance}
                                        onChange={(e) =>
                                            setEnhance(e.target.checked)
                                        }
                                        className="w-5 h-5"
                                    />
                                    <span className="text-sm">Enhance</span>
                                </label>
                                <label className="flex items-center gap-2 font-body text-offblack cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={nologo}
                                        onChange={(e) =>
                                            setNologo(e.target.checked)
                                        }
                                        className="w-5 h-5"
                                    />
                                    <span className="text-sm">No Logo</span>
                                </label>
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
                            : `Generate ${isImageModel ? "Image" : "Text"}`}
                    </Button>

                    {/* Result Display */}
                    {result && (
                        <div className="bg-offblack/5 p-6">
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
                </div>
            </div>
        </div>
    );
}

export default PlayPage;
