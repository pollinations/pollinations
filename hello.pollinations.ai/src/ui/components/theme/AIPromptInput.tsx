import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { generateTheme } from "../../../content/guidelines/helpers/styling-helpers";
import type { ThemeDictionary } from "../../../content/theme/engine";
import { SparklesIcon, SendIcon } from "lucide-react";
import { Button } from "../ui/button";

interface AIPromptInputProps {
    isOpen: boolean;
}

/**
 * General AI prompt input interface
 * Handles user text input for AI interactions
 * Currently used for theme generation, but designed to be reusable
 */
export function AIPromptInput({ isOpen }: AIPromptInputProps) {
    const [prompt, setPrompt] = useState("");
    const [activePrompt, setActivePrompt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [generatedTheme, setGeneratedTheme] =
        useState<ThemeDictionary | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { setTheme } = useTheme();

    // Generate theme when activePrompt changes
    useEffect(() => {
        if (!activePrompt) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        generateTheme(activePrompt, controller.signal)
            .then((theme) => {
                if (!controller.signal.aborted) {
                    setGeneratedTheme(theme);
                }
            })
            .catch((err) => {
                if (err.name !== "AbortError" && !controller.signal.aborted) {
                    setError(err);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [activePrompt]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Apply theme when generated
    useEffect(() => {
        if (generatedTheme) {
            setTheme(generatedTheme);
            setActivePrompt(null);
            setGeneratedTheme(null);
        }
    }, [generatedTheme, setTheme]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (prompt.trim() && !loading) {
            setActivePrompt(prompt);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="w-full h-16 animate-in fade-in slide-in-from-top-2 duration-200 flex items-center justify-center"
            style={{
                backgroundColor: "var(--surface-base)",
            }}
        >
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-4xl mx-auto flex items-center h-full px-4 md:px-8 gap-4"
            >
                <Button
                    type="submit"
                    disabled={!prompt.trim() || loading}
                    variant="icon"
                    size={null}
                    className="w-6 h-6 md:w-8 md:h-8 text-text-body-main flex-shrink-0"
                >
                    {loading ? (
                        <SparklesIcon className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                    ) : (
                        <SendIcon className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                </Button>

                <div className="flex-1 relative h-full flex items-center">
                    <style>
                        {`
                            .theme-prompt-input::placeholder {
                                color: var(--text-tertiary) !important;
                                opacity: 1 !important;
                            }
                        `}
                    </style>
                    <input
                        ref={inputRef}
                        id="theme-prompt"
                        name="theme-prompt"
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe a theme (e.g. 'Cyberpunk Neon')..."
                        className="theme-prompt-input w-full h-full bg-transparent outline-none text-base md:text-lg font-medium rounded-input"
                        style={{
                            color: "var(--text-secondary)",
                            caretColor: "var(--text-brand)",
                        }}
                        disabled={loading}
                    />
                </div>
            </form>
            {error && (
                <div className="absolute top-full left-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 text-center">
                    {error && typeof error === "object" && "message" in error
                        ? (error as Error).message
                        : String(error)}
                </div>
            )}
        </div>
    );
}
