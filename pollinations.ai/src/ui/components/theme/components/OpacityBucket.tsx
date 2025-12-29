import type React from "react";
import type { OpacityBucketData } from "../types";
import { TokenChip } from "./TokenChip";

interface OpacityBucketProps {
    bucketId: string;
    bucket: OpacityBucketData;
    onChange: (bucketId: string, newValue: string) => void;
    onDrop: (e: React.DragEvent, targetBucketId: string) => void;
    onDragOver: (e: React.DragEvent) => void;
}

export function OpacityBucket({
    bucketId,
    bucket,
    onChange,
    onDrop,
    onDragOver,
}: OpacityBucketProps) {
    return (
        <div
            onDrop={(e) => onDrop(e, bucketId)}
            onDragOver={onDragOver}
            className="
                flex flex-col gap-1.5 p-2 rounded border border-transparent 
                bg-gray-50/50 hover:bg-gray-100 hover:border-gray-200 transition-colors
            "
        >
            {/* Header: Value Input */}
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={bucket.value}
                    onChange={(e) => onChange(bucketId, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 text-[10px] font-mono text-gray-700 bg-white border border-gray-200 rounded focus:outline-none focus:border-black"
                    placeholder="e.g. 0.5, 0.8, 1.0"
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
