import { toast } from "sonner";

export default function OutputSection({ oppositePrompt, loading }) {
    if (!oppositePrompt && !loading) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(oppositePrompt || "");
            toast.success("Opposite prompt copied");
        } catch (err) {
            console.error("Clipboard copy failed:", err);
            toast.error("Failed to copy to clipboard");
        }
    };

    return (
        <div className="mt-8 w-full">
            <h2 className="text-xl font-bold mb-4 text-purple-200">
                🌀 Opposite Prompt
            </h2>

            {loading ? (
                <div className="bg-white/10 backdrop-blur-sm px-4 py-6 rounded-2xl border border-white/15 shadow-lg">
                    <div className="space-y-2 animate-pulse">
                        <div className="h-4 bg-white/20 rounded w-5/6"></div>
                        <div className="h-4 bg-white/15 rounded w-3/4"></div>
                        <div className="h-4 bg-white/10 rounded w-2/3"></div>
                    </div>
                    <p className="text-purple-200/80 italic mt-3">
                        Creating semantic opposite...
                    </p>
                </div>
            ) : (
                <div className="relative bg-white/10 backdrop-blur-sm px-5 py-4 rounded-2xl border border-white/20 shadow-lg">
                    <p className="italic text-lg leading-relaxed text-white/95 break-words pr-16">
                        {oppositePrompt}
                    </p>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/20 transition-colors"
                        aria-label="Copy opposite prompt"
                    >
                        <span>Copy</span>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M9 9h9v12H9z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            />
                            <path
                                d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
