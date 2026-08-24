import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, X } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface StoryEntry {
    id: string;
    description: string;
    image: string;
    timestamp: number;
    characterChoice?: string;
}

interface StoryHistoryProps {
    storyHistory: StoryEntry[];
    isOpen: boolean;
    onClose: () => void;
    characterName: string;
}

export function StoryHistory({
    storyHistory,
    isOpen,
    onClose,
    characterName,
}: StoryHistoryProps) {
    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 z-40"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-4 md:inset-8 lg:inset-16 bg-[#1a0f08] border-2 border-[#d4a76a] rounded-lg z-50 flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-[#d4a76a]/30">
                            <div>
                                <h2 className="text-2xl font-bold text-[#f5e6d3] font-medieval">
                                    {characterName}'s Adventure Chronicle
                                </h2>
                                <p className="text-[#b8a389] mt-1">
                                    Complete story from the beginning •{" "}
                                    {storyHistory.length} chapters
                                </p>
                            </div>
                            <Button
                                onClick={onClose}
                                variant="ghost"
                                size="sm"
                                className="text-[#b8a389] hover:text-[#f5e6d3] hover:bg-[#d4a76a]/10"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Story Content */}
                        <div className="flex-1 overflow-hidden">
                            <ScrollArea className="h-full">
                                <div className="p-6 space-y-8">
                                    {storyHistory.map((entry, index) => (
                                        <motion.div
                                            key={entry.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                            className="relative"
                                        >
                                            {/* Timeline connector */}
                                            {index <
                                                storyHistory.length - 1 && (
                                                <div className="absolute left-8 top-16 w-0.5 h-16 bg-gradient-to-b from-[#d4a76a] to-transparent" />
                                            )}

                                            <div className="flex gap-6">
                                                {/* Timeline dot */}
                                                <div className="flex-shrink-0 mt-4">
                                                    <div className="w-4 h-4 bg-[#d4a76a] rounded-full border-2 border-[#1a0f08]" />
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1">
                                                    {/* Choice indicator */}
                                                    {entry.characterChoice && (
                                                        <div className="flex items-center gap-2 mb-3 text-sm text-[#d4a76a] font-medium">
                                                            <ArrowRight className="h-4 w-4" />
                                                            <span>
                                                                "
                                                                {
                                                                    entry.characterChoice
                                                                }
                                                                "
                                                            </span>
                                                            <Clock className="h-3 w-3 ml-auto" />
                                                            <span className="text-[#b8a389]">
                                                                {formatTime(
                                                                    entry.timestamp,
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Story content */}
                                                    <div className="bg-[#2c1e12] border border-[#d4a76a]/20 rounded-lg overflow-hidden">
                                                        <div className="p-4 md:p-6">
                                                            {/* Text */}
                                                            <p className="text-[#f5e6d3] leading-relaxed mb-4 text-sm md:text-base">
                                                                {
                                                                    entry.description
                                                                }
                                                            </p>

                                                            {/* Image */}
                                                            {entry.image && (
                                                                <div className="w-full h-32 md:h-48 relative overflow-hidden rounded-lg border border-[#d4a76a]/20">
                                                                    <img
                                                                        src={
                                                                            entry.image
                                                                        }
                                                                        alt={`Scene ${index + 1}`}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {storyHistory.length === 0 && (
                                        <div className="text-center py-12">
                                            <p className="text-[#b8a389] text-lg">
                                                No story entries yet.
                                            </p>
                                            <p className="text-[#8b7355] mt-2">
                                                Start your adventure to see the
                                                chronicle unfold!
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-[#d4a76a]/30 p-4">
                            <div className="flex justify-between items-center text-sm text-[#b8a389]">
                                <span>
                                    Scroll to view your complete adventure
                                </span>
                                <Button
                                    onClick={onClose}
                                    className="bg-[#d4a76a] hover:bg-[#c9975a] text-[#2c1e12]"
                                >
                                    Continue Adventure
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
