import React from "react";
import { getTokenLabel } from "../utils/token-helpers";

interface TokenChipProps {
    token: string;
    onDragStart: (e: React.DragEvent, token: string) => void;
}

export function TokenChip({ token, onDragStart }: TokenChipProps) {
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
            title={`${token}: ${label}`}
        >
            <div className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-blue-500" />
            {token}
        </div>
    );
}
