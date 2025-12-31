import { Package } from "lucide-react";
import { motion } from "motion/react";
import { ImageWithFallback } from "./figma/ImageWithFallback.tsx";

export interface InventoryItem {
    id: string;
    name: string;
    quantity: number;
    type: "weapon" | "armor" | "misc" | "consumable";
    description: string;
    rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
    image: string;
    value?: number;
}

interface InventoryGridProps {
    items: InventoryItem[];
    onItemClick?: (item: InventoryItem) => void;
    compact?: boolean;
}

export function InventoryGrid({
    items,
    onItemClick,
    compact = false,
}: InventoryGridProps) {
    const maxItems = compact ? 6 : items.length;
    const displayItems = items.slice(0, maxItems);

    // Fill empty slots
    const emptySlots = compact ? Math.max(0, 6 - displayItems.length) : 0;

    return (
        <div
            className={`grid ${compact ? "grid-cols-3 gap-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"}`}
        >
            {displayItems.map((item, index) => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onItemClick?.(item)}
                    className={`bg-[#3a2817] border-2 border-[#d4a76a] rounded-lg overflow-hidden hover:border-[#e5b77b] transition-all duration-300 hover:shadow-[0_0_10px_rgba(212,167,106,0.3)] cursor-pointer ${
                        compact ? "p-2" : "p-3"
                    }`}
                >
                    <div
                        className={`bg-[#2c1e12] rounded flex items-center justify-center ${compact ? "h-12" : "aspect-square"}`}
                    >
                        {item.image ? (
                            <ImageWithFallback
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <Package
                                className={`text-[#d4a76a] ${compact ? "w-6 h-6" : "w-12 h-12"}`}
                            />
                        )}
                    </div>
                    {!compact && (
                        <div className="mt-2">
                            <p className="text-xs text-[#f5e6d3] truncate">
                                {item.name}
                            </p>
                        </div>
                    )}
                </motion.div>
            ))}

            {Array.from({ length: emptySlots }).map((_, index) => (
                <div
                    key={`empty-${index}`}
                    className={`bg-[#2c1e12] border-2 border-[#5a4332] rounded-lg opacity-50 ${
                        compact ? "p-2" : "p-3"
                    }`}
                >
                    <div
                        className={`bg-[#3a2817] rounded flex items-center justify-center ${compact ? "h-12" : "aspect-square"}`}
                    >
                        <Package
                            className={`text-[#5a4332] ${compact ? "w-6 h-6" : "w-12 h-12"}`}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
