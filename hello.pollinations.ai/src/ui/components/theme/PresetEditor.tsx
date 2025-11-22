import { useEffect, useState } from "react";
import { themeToDictionary, type TokenId } from "../../../content/theme";
import { PRESETS, DEFAULT_PRESET } from "../../../content/theme/presets";
import { useTheme } from "../../contexts/ThemeContext";
import type { ThemeState, RadiusState, FontState } from "./types";
import {
    convertToThemeState,
    convertRadiusToState,
    convertFontsToState,
    convertRadiusToDict,
    convertFontsToDict,
} from "./utils/state-converters";
import { getRandomColor } from "./utils/color-utils";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useColorSync, useRadiusSync, useFontSync } from "./hooks/useCSSSync";
import {
    useDragAndDrop,
    colorTokenFilter,
    radiusTokenFilter,
    fontTokenFilter,
} from "./hooks/useDragAndDrop";
import { ColorBucket } from "./components/ColorBucket";
import { RadiusBucket } from "./components/RadiusBucket";
import { FontBucket } from "./components/FontBucket";
import { PresetHeader } from "./components/PresetHeader";

export function PresetEditor() {
    const [isOpen, setIsOpen] = useState(false);
    const { themeDefinition } = useTheme();

    // State
    const [theme, setTheme] = useState<ThemeState>(() =>
        convertToThemeState(themeDefinition)
    );
    const [radius, setRadius] = useState<RadiusState>(() =>
        convertRadiusToState(themeDefinition.borderRadius || {})
    );
    const [fonts, setFonts] = useState<FontState>(() =>
        convertFontsToState(themeDefinition.fonts || {})
    );
    const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);

    // Sync with context theme when it changes
    useEffect(() => {
        setTheme(convertToThemeState(themeDefinition));
        setRadius(convertRadiusToState(themeDefinition.borderRadius || {}));
        setFonts(convertFontsToState(themeDefinition.fonts || {}));
    }, [themeDefinition]);

    // Sync to CSS
    useColorSync(theme);
    useRadiusSync(radius);
    useFontSync(fonts);

    // Drag and drop
    const colorDnD = useDragAndDrop(setTheme, colorTokenFilter);
    const radiusDnD = useDragAndDrop(setRadius, radiusTokenFilter);
    const fontDnD = useDragAndDrop(setFonts, fontTokenFilter);

    // Toggle on Ctrl+E
    useKeyboardShortcut("e", true, () => setIsOpen((prev) => !prev));

    // Handlers
    const handleColorChange = (bucketId: string, newColor: string) => {
        setTheme((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                color: newColor,
            },
        }));
    };

    const handleRadiusChange = (bucketId: string, newValue: string) => {
        setRadius((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                value: newValue,
            },
        }));
    };

    const handleFontChange = (bucketId: string, newValue: string) => {
        setFonts((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                value: newValue,
            },
        }));
    };

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

    const handleSetAllWhite = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#FFFFFF", tokens: allTokens } };
        });
    };

    const handleSetAllBlack = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#000000", tokens: allTokens } };
        });
    };

    const handleLoadPreset = (presetId: string) => {
        const preset = PRESETS.find((p) => p.id === presetId);
        if (preset) {
            const dict = themeToDictionary(preset.theme);
            setTheme(convertToThemeState(dict));
            setRadius(convertRadiusToState(dict.borderRadius || {}));
            setFonts(convertFontsToState(dict.fonts || {}));
            setSelectedPresetId(presetId);
        }
    };

    const handleDownloadPreset = () => {
        const slots: Record<string, { hex: string; ids: TokenId[] }> = {};
        Object.entries(theme).forEach(([_, bucket], index) => {
            slots[`slot_${index}`] = {
                hex: bucket.color,
                ids: bucket.tokens,
            };
        });

        const radiusDict = convertRadiusToDict(radius);
        const fontDict = convertFontsToDict(fonts);

        const content = `import { LLMThemeResponse, processTheme } from "../engine";

export const CustomTheme: LLMThemeResponse = ${JSON.stringify(
            { slots, borderRadius: radiusDict, fonts: fontDict },
            null,
            4
        )};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;
`;

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
            <PresetHeader
                selectedPresetId={selectedPresetId}
                presets={PRESETS}
                onPresetChange={handleLoadPreset}
                onDownload={handleDownloadPreset}
                onRandomizeColors={handleRandomizeColors}
                onRandomizeAssignments={handleRandomizeAssignments}
                onSetAllWhite={handleSetAllWhite}
                onSetAllBlack={handleSetAllBlack}
                onClose={() => setIsOpen(false)}
            />

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Colors Section */}
                {Object.entries(theme).map(([bucketId, bucket]) => (
                    <ColorBucket
                        key={bucketId}
                        bucketId={bucketId}
                        bucket={bucket}
                        onColorChange={handleColorChange}
                        onDrop={colorDnD.handleDrop}
                        onDragOver={colorDnD.handleDragOver}
                    />
                ))}

                {/* Border Radius Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Border Radius
                    </div>
                    {Object.entries(radius).map(([bucketId, bucket]) => (
                        <RadiusBucket
                            key={bucketId}
                            bucketId={bucketId}
                            bucket={bucket}
                            onChange={handleRadiusChange}
                            onDrop={radiusDnD.handleDrop}
                            onDragOver={radiusDnD.handleDragOver}
                        />
                    ))}
                </div>

                {/* Typography Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Typography
                    </div>
                    {Object.entries(fonts).map(([bucketId, bucket]) => (
                        <FontBucket
                            key={bucketId}
                            bucketId={bucketId}
                            bucket={bucket}
                            onChange={handleFontChange}
                            onDrop={fontDnD.handleDrop}
                            onDragOver={fontDnD.handleDragOver}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
