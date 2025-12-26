import React from "react";
import type { ColorBucketData } from "../types";
import { rgbaToHex } from "../utils/color-utils";
import { TokenChip } from "./TokenChip";

interface ColorBucketProps {
    bucketId: string;
    bucket: ColorBucketData;
    onColorChange: (bucketId: string, newColor: string) => void;
    onDrop: (e: React.DragEvent, targetBucketId: string) => void;
    onDragOver: (e: React.DragEvent) => void;
}

export function ColorBucket({
    bucketId,
    bucket,
    onColorChange,
    onDrop,
    onDragOver,
}: ColorBucketProps) {
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
