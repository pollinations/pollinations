import { motion } from "motion/react";
import { ScrollArea } from "./ui/scroll-area";

interface StoryTextProps {
    text: string;
    isLoading?: boolean;
}

export function StoryText({ text, isLoading = false }: StoryTextProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-[#3a2817] rounded-lg p-6 border-2 border-[#d4a76a] shadow-xl"
        >
            <h3 className="text-[#d4a76a] text-lg font-semibold mb-4 font-serif">Adventure Story</h3>

            <ScrollArea className="h-40 w-full rounded border border-[#5a4332] bg-[#2c1e12]/50 p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-[#b8a389] italic">The tale unfolds...</div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        <p className="text-[#f5e6d3] leading-relaxed whitespace-pre-wrap text-sm">
                            {text}
                        </p>
                    </motion.div>
                )}
            </ScrollArea>
        </motion.div>
    );
}