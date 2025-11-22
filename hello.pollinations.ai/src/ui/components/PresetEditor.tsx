import React, { useEffect, useState } from "react";
import {
    themeToDictionary,
    type ThemeDictionary,
} from "../../content/theme";
import type { TokenId } from "../../content/theme";
import { TOKENS } from "../../content/theme/tokens";
import { PRESETS, DEFAULT_PRESET } from "../../content/theme/presets";
import { useTheme } from "../contexts/ThemeContext";
import {
    CheckIcon,
    ShuffleIcon,
    DicesIcon,
    PaletteIcon,
    DownloadIcon,
} from "lucide-react";

// ============================================
// TYPES & HELPERS
// ============================================

interface ColorBucketData {
    color: string;
    tokens: TokenId[];
}

type ThemeState = Record<string, ColorBucketData>;

// PresetEditor dev tool helper - get human-readable token label
const getTokenLabel = (id: string): string | undefined => {
    return TOKENS.find((t) => t.id === id)?.description;
};

const tokenToCssVar = (id: string) => {
    return `--${id}`;
};

const getRandomColor = (): string => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `#${r.toString(16).padStart(2, "0")}${g
        .toString(16)
        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

// Convert rgba() to #rrggbb for color inputs (they don't support rgba)
const rgbaToHex = (color: string): string => {
    // Already hex - return as is
    if (color.startsWith("#")) {
        // Ensure it's #rrggbb format (not #rrggbbaa)
        return color.substring(0, 7);
    }

    // Parse rgba(r, g, b, a) format
    const rgbaMatch = color.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
    );
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]);
        const g = parseInt(rgbaMatch[2]);
        const b = parseInt(rgbaMatch[3]);
        return `#${r.toString(16).padStart(2, "0")}${g
            .toString(16)
            .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    // Fallback to black if we can't parse
    return "#000000";
};

// Convert dictionary format to bucket format
const convertToThemeState = (dict: ThemeDictionary): ThemeState => {
    const newState: ThemeState = {};
    Object.entries(dict.colors).forEach(([color, tokens], index) => {
        newState[`bucket-${index}`] = { color, tokens };
    });
    return newState;
};


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
                <button
                    type="button"
                    className="relative w-5 h-5 rounded-full overflow-hidden shadow-sm ring-1 ring-black/5 flex-shrink-0 cursor-pointer border-none p-0"
                    onClick={handleColorInputClick}
                >
                    <input
                        ref={colorInputRef}
                        id={`color-picker-${bucketId}`}
                        name={`color-picker-${bucketId}`}
                        type="color"
                        value={rgbaToHex(bucket.color)}
                        onChange={(e) => handleColorChange(e.target.value)}
                        onBlur={handleColorInputBlur}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer pointer-events-none"
                        tabIndex={-1}
                    />
                </button>
                <input
                    id={`color-hex-${bucketId}`}
                    name={`color-hex-${bucketId}`}
                    type="text"
                    value={bucket.color}
                    onChange={(e) => onColorChange(bucketId, e.target.value)}
                    className="flex-1 min-w-0 text-[10px] font-mono text-gray-500 bg-transparent focus:outline-none focus:text-black"
                />
                <button
                    type="button"
                    onClick={() => onColorChange(bucketId, getRandomColor())}
                    className="p-1 text-gray-400 hover:text-black transition-colors flex-shrink-0"
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

export function PresetEditor() {
    const [isOpen, setIsOpen] = useState(false);
    const { themeDefinition } = useTheme();
    const [theme, setTheme] = useState<ThemeState>(() =>
        convertToThemeState(themeDefinition)
    );
    const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);

    // Sync with context theme when it changes
    useEffect(() => {
        setTheme(convertToThemeState(themeDefinition));
    }, [themeDefinition]);

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

    // Load Preset
    const handleLoadPreset = (presetId: string) => {
        const preset = PRESETS.find(p => p.id === presetId);
        if (preset) {
            setTheme(convertToThemeState(themeToDictionary(preset.theme)));
            setSelectedPresetId(presetId);
        }
    };

    // Download current theme as TypeScript file
    const handleDownloadPreset = () => {
        // Convert current theme state to LLMThemeResponse format
        const slots: Record<string, { hex: string; ids: TokenId[] }> = {};
        Object.entries(theme).forEach(([_, bucket], index) => {
            slots[`slot_${index}`] = {
                hex: bucket.color,
                ids: bucket.tokens,
            };
        });

        // Generate TypeScript file content
        const content = `import { LLMThemeResponse, processTheme } from "../engine";

export const CustomTheme: LLMThemeResponse = ${JSON.stringify({ slots, borderRadius: {} }, null, 4)};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;
`;

        // Trigger download
        const blob = new Blob([content], { type: "text/typescript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "custom-preset.ts";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
            {/* Header with Preset Selector */}
            <div className="flex flex-col gap-2 p-3 border-b border-gray-100">
                {/* Preset Dropdown */}
                <select
                    value={selectedPresetId}
                    onChange={(e) => handleLoadPreset(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-mono bg-white border border-gray-200 rounded focus:outline-none focus:border-black"
                >
                    {PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                            {preset.name}
                        </option>
                    ))}
                </select>

                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={handleDownloadPreset}
                            className="p-1 text-gray-400 hover:text-black transition-colors"
                            title="Download Preset"
                        >
                            <DownloadIcon className="w-3 h-3" />
                        </button>

                        <button
                            type="button"
                            onClick={handleRandomizeColors}
                            className="p-1 text-gray-400 hover:text-black transition-colors"
                            title="Randomize Colors"
                        >
                            <PaletteIcon className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={handleRandomizeAssignments}
                            className="p-1 text-gray-400 hover:text-black transition-colors"
                            title="Randomize Assignments"
                        >
                            <ShuffleIcon className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={handleSetAllWhite}
                            className="p-1 hover:scale-110 transition-transform"
                            title="Set All to White"
                        >
                            <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm" />
                        </button>
                        <button
                            type="button"
                            onClick={handleSetAllBlack}
                            className="p-1 hover:scale-110 transition-transform"
                            title="Set All to Black"
                        >
                            <div className="w-3 h-3 bg-black rounded-sm" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Close"
                    >
                        <CheckIcon className="w-3 h-3" />
                    </button>
                </div>
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
