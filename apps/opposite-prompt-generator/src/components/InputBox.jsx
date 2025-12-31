import { useState } from "react";
import { toast } from "sonner";

export default function InputBox({
    setOppositePrompt,
    setImageUrl,
    setLoadingText,
    setLoadingImage,
    loadingText,
    loadingImage,
}) {
    const [prompt, setPrompt] = useState("");
    const isBusy = loadingText || loadingImage;
    const charLimit = 200;

    const handleGenerate = async (e) => {
        e?.preventDefault?.();
        const trimmed = prompt.trim();

        if (!trimmed) {
            toast.error("Please enter a prompt to transform.");
            return;
        }
        if (trimmed.length > charLimit) {
            toast.error(`Prompt too long. Max ${charLimit} characters.`);
            return;
        }

        setLoadingText(true);
        setLoadingImage(true);
        setOppositePrompt("");
        setImageUrl("");

        try {
            const response = await fetch("https://text.pollinations.ai/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai",
                    messages: [
                        {
                            role: "system",
                            content:
                                "Transform the following image prompt into its semantic opposite. Invert key attributes such as mood, lighting, subject, and environment. Respond ONLY with a short descriptive phrase (5 - 10 words), not a sentence or story. Do NOT include people, gender, or emotions unless explicitly in the original prompt. Examples: happy young woman in summer dress → sad elderly man in winter coat; bright sunny beach → dark rainy forest; cute fluffy puppy → fierce scaly dragon. Return ONLY the transformed phrase.",
                        },
                        { role: "user", content: trimmed },
                    ],
                    jsonMode: false,
                }),
            });

            const oppositePrompt = await response.text();

            if (!response.ok || !oppositePrompt.trim()) {
                throw new Error(
                    `Text API failed with status ${response.status}`,
                );
            }

            setOppositePrompt(oppositePrompt);
            setLoadingText(false);
            toast.success("Opposite prompt generated");

            // Prepare image URL and show after a small delay to let UI breathe
            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
                oppositePrompt,
            )}`;

            setTimeout(() => {
                setImageUrl(imgUrl);
                setLoadingImage(false);
            }, 800);
        } catch (err) {
            console.error("API error:", err);
            setLoadingText(false);
            setLoadingImage(false);
            toast.error("Failed to generate. See console for details.");
        }
    };

    const handleClear = () => {
        setPrompt("");
        setOppositePrompt("");
        setImageUrl("");
        setLoadingText(false);
        setLoadingImage(false);
    };

    const remaining = Math.max(0, charLimit - prompt.length);

    return (
        <form
            onSubmit={handleGenerate}
            className="w-full flex flex-col gap-3 sm:gap-4"
            aria-label="Opposite Prompt Generator form"
        >
            <div className="w-full">
                <label
                    htmlFor="prompt"
                    className="block text-sm font-medium mb-2 text-purple-200/90"
                >
                    Enter your image prompt
                </label>
                <div className="relative">
                    <textarea
                        id="prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., A happy puppy playing in a sunny park"
                        aria-label="Prompt input"
                        aria-invalid={prompt.trim() === "" ? "true" : "false"}
                        className="w-full resize-y min-h-28 p-4 rounded-2xl text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white/95 backdrop-blur-sm shadow-lg"
                        maxLength={charLimit + 50}
                    />
                    <div className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-500/80">
                        {remaining} left
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:from-pink-500/50 disabled:to-purple-600/50 px-5 sm:px-6 py-3 rounded-2xl font-semibold transition-all duration-300 shadow-lg disabled:cursor-not-allowed"
                >
                    {isBusy ? (
                        <>
                            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>
                                {loadingText
                                    ? "Processing text..."
                                    : "Generating image..."}
                            </span>
                        </>
                    ) : (
                        <>
                            <span>Generate Opposite</span>
                            <span aria-hidden>🎭</span>
                        </>
                    )}
                </button>

                <button
                    type="button"
                    onClick={handleClear}
                    disabled={
                        isBusy || (!prompt && !loadingText && !loadingImage)
                    }
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-medium bg-white/10 hover:bg-white/15 border border-white/15 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                    Clear
                </button>

                <div className="ml-auto text-xs text-white/70">
                    Tip: Press Enter to generate
                </div>
            </div>
        </form>
    );
}
