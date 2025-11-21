import React, { useEffect, useState } from "react";
import { DefaultTheme } from "../config/defaultTheme";
import { themeToDictionary, getTokenLabel } from "../config/themeEngine";
import {
    RefreshCwIcon,
    CheckIcon,
    ShuffleIcon,
    PaletteIcon,
    DicesIcon,
    SparklesIcon,
} from "lucide-react";
import { useThemeGenerator, ThemeDefinition } from "../hooks/useThemeGenerator";
import { TokenId } from "../config/designTokens";

// ============================================
// TYPES & HELPERS
// ============================================

interface ColorBucketData {
    color: string;
    tokens: TokenId[];
}

type ThemeState = Record<string, ColorBucketData>;

const tokenToCssVar = (id: string) => {
    return `--${id}`;
};

const getRandomColor = () => {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

// Convert dictionary format to bucket format
const convertToThemeState = (dict: ThemeDefinition): ThemeState => {
    const newState: ThemeState = {};
    Object.entries(dict).forEach(([color, tokens], index) => {
        newState[`bucket-${index}`] = { color, tokens };
    });
    return newState;
};

const DefaultThemeDefinition = themeToDictionary(DefaultTheme);

// ============================================
// COMPONENTS
// ============================================

function TokenChip({
    token,
    onDragStart,
}: {
    token: string;
    onDragStart: (e: React.DragEvent, token: string) => void;
}) {
    const label = getTokenLabel(token);
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, token)}
            className="
                group relative flex items-center gap-1 px-1.5 py-0.5 
                bg-white border border-gray-200 rounded-[2px] shadow-sm 
                cursor-grab active:cursor-grabbing hover:border-gray-400 transition-all
                text-[9px] font-mono text-gray-600 leading-tight
            "
            title={`${token}: ${label}`} // Show Label on hover
        >
            <div className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-500" />
            {token}
        </div>
    );
}

function ColorBucket({
    bucketId,
    bucket,
    onColorChange,
    onDrop,
    onDragOver,
}: {
    bucketId: string;
    bucket: ColorBucketData;
    onColorChange: (bucketId: string, newColor: string) => void;
    onDrop: (e: React.DragEvent, targetBucketId: string) => void;
    onDragOver: (e: React.DragEvent) => void;
}) {
    const colorInputRef = React.useRef<HTMLInputElement>(null);
    const [isPickerOpen, setIsPickerOpen] = React.useState(false);

    const handleColorInputClick = () => {
        setIsPickerOpen(true);
        colorInputRef.current?.click();
    };

    const handleColorChange = (newColor: string) => {
        onColorChange(bucketId, newColor);
        // Keep the picker open by clicking it again after a short delay
        if (isPickerOpen) {
            setTimeout(() => {
                colorInputRef.current?.click();
            }, 0);
        }
    };

    const handleColorInputBlur = () => {
        setIsPickerOpen(false);
    };

    return (
        <div
            onDrop={(e) => onDrop(e, bucketId)}
            onDragOver={onDragOver}
            className="
                flex flex-col gap-1.5 p-2 rounded border border-transparent 
                bg-gray-50/50 hover:bg-gray-100 hover:border-gray-200 transition-colors
            "
        >
            {/* Header: Color Input & Hex */}
            <div className="flex items-center gap-2">
                <div
                    className="relative w-5 h-5 rounded-full overflow-hidden shadow-sm ring-1 ring-black/5 flex-shrink-0 cursor-pointer"
                    onClick={handleColorInputClick}
                >
                    <input
                        ref={colorInputRef}
                        type="color"
                        value={bucket.color}
                        onChange={(e) => handleColorChange(e.target.value)}
                        onBlur={handleColorInputBlur}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer pointer-events-none"
                    />
                </div>
                <input
                    type="text"
                    value={bucket.color}
                    onChange={(e) => onColorChange(bucketId, e.target.value)}
                    className="w-full text-[10px] font-mono text-gray-500 bg-transparent focus:outline-none focus:text-black"
                />
                <button
                    onClick={() => onColorChange(bucketId, getRandomColor())}
                    className="p-1 text-gray-400 hover:text-black transition-colors opacity-0 group-hover:opacity-100"
                    title="Randomize this color"
                >
                    <DicesIcon className="w-3 h-3" />
                </button>
            </div>

            {/* Token List - wrapped horizontally */}
            <div className="flex flex-wrap gap-1 min-h-[20px]">
                {bucket.tokens.map((token) => (
                    <TokenChip
                        key={token}
                        token={token}
                        onDragStart={(e, t) => {
                            e.dataTransfer.setData("text/plain", t);
                            e.dataTransfer.effectAllowed = "move";
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ColorPicker() {
    const [isOpen, setIsOpen] = useState(false);
    const [theme, setTheme] = useState<ThemeState>(() =>
        convertToThemeState(DefaultThemeDefinition)
    );
    const [aiPrompt, setAiPrompt] = useState("");

    // AI Theme Generator
    const {
        generateTheme,
        theme: aiGeneratedTheme,
        loading: aiLoading,
        error: aiError,
    } = useThemeGenerator();

    // Apply AI-generated theme when ready
    useEffect(() => {
        if (aiGeneratedTheme) {
            setTheme(convertToThemeState(aiGeneratedTheme));
        }
    }, [aiGeneratedTheme]);

    // Toggle on Ctrl+E
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "e") {
                e.preventDefault();
                setIsOpen((prev) => !prev);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Sync CSS variables when theme changes
    useEffect(() => {
        Object.values(theme).forEach((bucket) => {
            bucket.tokens.forEach((tokenId) => {
                const cssVar = tokenToCssVar(tokenId);
                document.documentElement.style.setProperty(
                    cssVar,
                    bucket.color
                );
            });
        });
    }, [theme]);

    // Handle Drag & Drop
    const handleDrop = (e: React.DragEvent, targetBucketId: string) => {
        e.preventDefault();
        const token = e.dataTransfer.getData("text/plain") as TokenId;

        if (!token) return;

        setTheme((prev) => {
            const newTheme = { ...prev };

            // Remove token from all buckets
            Object.keys(newTheme).forEach((bucketId) => {
                newTheme[bucketId] = {
                    ...newTheme[bucketId],
                    tokens: newTheme[bucketId].tokens.filter(
                        (t) => t !== token
                    ),
                };
            });

            // Add to target bucket
            if (!newTheme[targetBucketId].tokens.includes(token)) {
                newTheme[targetBucketId] = {
                    ...newTheme[targetBucketId],
                    tokens: [...newTheme[targetBucketId].tokens, token],
                };
            }

            return newTheme;
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    // Handle Color Change - only updates the color, not tokens
    const handleColorChange = (bucketId: string, newColor: string) => {
        setTheme((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                color: newColor,
            },
        }));
    };

    // Randomize Colors - randomizes only colors, keeps token assignments
    const handleRandomizeColors = () => {
        setTheme((prev) => {
            const newTheme = { ...prev };
            Object.keys(newTheme).forEach((bucketId) => {
                newTheme[bucketId] = {
                    ...newTheme[bucketId],
                    color: getRandomColor(),
                };
            });
            return newTheme;
        });
    };

    // Randomize Assignments - shuffles tokens across buckets
    const handleRandomizeAssignments = () => {
        setTheme((prev) => {
            const bucketIds = Object.keys(prev);
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            const newTheme = { ...prev };

            // Clear all token arrays but keep colors
            bucketIds.forEach((id) => {
                newTheme[id] = { ...newTheme[id], tokens: [] };
            });

            // Shuffle tokens and distribute
            allTokens.forEach((token) => {
                const randomId =
                    bucketIds[Math.floor(Math.random() * bucketIds.length)];
                newTheme[randomId].tokens.push(token);
            });

            return newTheme;
        });
    };

    // Set All Colors to White
    const handleSetAllWhite = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#FFFFFF", tokens: allTokens } };
        });
    };

    // Set All Colors to Black
    const handleSetAllBlack = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#000000", tokens: allTokens } };
        });
    };

    // Reset
    const handleReset = () => {
        setTheme(convertToThemeState(DefaultThemeDefinition));
    };

    return (
        <div
            className={`
                fixed top-0 left-0 h-full w-auto min-w-[200px] max-w-[200px] z-[9999] 
                bg-white/95 backdrop-blur-sm border-r border-gray-200 shadow-xl
                transition-transform duration-300 ease-in-out
                flex flex-col
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
            `}
        >
            {/* Minimal Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <div className="flex gap-1">
                    <button
                        onClick={handleReset}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Reset"
                    >
                        <RefreshCwIcon className="w-3 h-3" />
                    </button>
                    <button
                        onClick={handleRandomizeColors}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Randomize Colors"
                    >
                        <PaletteIcon className="w-3 h-3" />
                    </button>
                    <button
                        onClick={handleRandomizeAssignments}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Randomize Assignments"
                    >
                        <ShuffleIcon className="w-3 h-3" />
                    </button>
                    <button
                        onClick={handleSetAllWhite}
                        className="p-1 hover:scale-110 transition-transform"
                        title="Set All to White"
                    >
                        <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm" />
                    </button>
                    <button
                        onClick={handleSetAllBlack}
                        className="p-1 hover:scale-110 transition-transform"
                        title="Set All to Black"
                    >
                        <div className="w-3 h-3 bg-black rounded-sm" />
                    </button>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-gray-400 hover:text-black transition-colors"
                    title="Close"
                >
                    <CheckIcon className="w-3 h-3" />
                </button>
            </div>

            {/* AI Theme Generator */}
            <div className="px-3 py-2 border-b border-gray-100 space-y-2">
                <div className="flex gap-1 items-start">
                    <textarea
                        value={aiPrompt}
                        onChange={(e) => {
                            setAiPrompt(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height =
                                e.target.scrollHeight + "px";
                        }}
                        onKeyDown={(e) => {
                            if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                aiPrompt.trim() &&
                                !aiLoading
                            ) {
                                e.preventDefault();
                                generateTheme(aiPrompt);
                            }
                        }}
                        placeholder="AI theme prompt..."
                        className="flex-1 text-xs px-2 py-2 bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-blue-400 transition-colors resize-none overflow-hidden"
                        disabled={aiLoading}
                        rows={1}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (aiPrompt.trim() && !aiLoading) {
                                generateTheme(aiPrompt);
                            }
                        }}
                        disabled={aiLoading || !aiPrompt.trim()}
                        className="p-1 text-purple-500 hover:text-purple-700 disabled:text-gray-300 transition-colors flex-shrink-0"
                        title="Generate AI Theme"
                    >
                        <SparklesIcon
                            className={`w-3 h-3 ${
                                aiLoading ? "animate-spin" : ""
                            }`}
                        />
                    </button>
                </div>
                {aiError && (
                    <div className="text-[9px] text-red-500 px-1">
                        Error: {aiError}
                    </div>
                )}
                {aiLoading && (
                    <div className="text-[9px] text-gray-500 px-1">
                        Generating theme...
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {Object.entries(theme).map(([bucketId, bucket]) => (
                    <ColorBucket
                        key={bucketId}
                        bucketId={bucketId}
                        bucket={bucket}
                        onColorChange={handleColorChange}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    />
                ))}
            </div>
        </div>
    );
}
