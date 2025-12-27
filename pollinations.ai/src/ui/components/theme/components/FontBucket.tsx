import type React from "react";
import {
    FONT_LIBRARY,
    type FontDefinition,
} from "../../../../theme/style/font-catalog";
import type { FontBucketData } from "../types";
import { TokenChip } from "./TokenChip";

interface FontBucketProps {
    bucketId: string;
    bucket: FontBucketData;
    onChange: (bucketId: string, newValue: string) => void;
    onDrop: (e: React.DragEvent, targetBucketId: string) => void;
    onDragOver: (e: React.DragEvent) => void;
}

export function FontBucket({
    bucketId,
    bucket,
    onChange,
    onDrop,
    onDragOver,
}: FontBucketProps) {
    // Group fonts by category
    const fontsByCategory = Object.values(FONT_LIBRARY).reduce(
        (acc, font) => {
            if (!acc[font.category]) {
                acc[font.category] = [];
            }
            acc[font.category].push(font);
            return acc;
        },
        {} as Record<string, FontDefinition[]>,
    );

    const categories = [
        "classic",
        "minimal",
        "tech",
        "creative",
        "display",
        "handwriting",
    ];
    const isInLibrary = Object.values(FONT_LIBRARY).some(
        (f) => f.family === bucket.value,
    );

    return (
        <div
            onDrop={(e) => onDrop(e, bucketId)}
            onDragOver={onDragOver}
            className="
                flex flex-col gap-1.5 p-2 rounded border border-transparent 
                bg-gray-50/50 hover:bg-gray-100 hover:border-gray-200 transition-colors
            "
        >
            {/* Header: Font Dropdown */}
            <div className="flex items-center gap-2">
                <select
                    value={bucket.value}
                    onChange={(e) => onChange(bucketId, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 text-[10px] font-mono text-gray-700 bg-white border border-gray-200 rounded focus:outline-none focus:border-black cursor-pointer"
                >
                    {!isInLibrary && (
                        <option value={bucket.value}>{bucket.value}</option>
                    )}
                    {categories.map((cat) => {
                        const fonts = fontsByCategory[cat];
                        if (!fonts || fonts.length === 0) return null;
                        return (
                            <optgroup key={cat} label={cat.toUpperCase()}>
                                {fonts.map((font) => (
                                    <option
                                        key={font.family}
                                        value={font.family}
                                    >
                                        {font.family}
                                    </option>
                                ))}
                            </optgroup>
                        );
                    })}
                </select>
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
