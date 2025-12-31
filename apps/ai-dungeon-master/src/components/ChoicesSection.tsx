import {
    ChevronDown,
    ChevronUp,
    Compass,
    Edit3,
    MessageCircle,
    Send,
    Shield,
    Sword,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

interface Choice {
    id: string;
    text: string;
    icon: "sword" | "explore" | "talk" | "defend";
}

interface ChoicesSectionProps {
    choices: Choice[];
    onChoiceSelect: (choiceId: string) => void;
    onCustomAction?: (text: string) => void;
    isLoading?: boolean;
}

const iconMap = {
    sword: Sword,
    explore: Compass,
    talk: MessageCircle,
    defend: Shield,
};

export function ChoicesSection({
    choices,
    onChoiceSelect,
    onCustomAction,
    isLoading = false,
}: ChoicesSectionProps) {
    const [customText, setCustomText] = useState("");
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [inputMode, setInputMode] = useState<"short" | "long">("short");

    const handleCustomSubmit = () => {
        if (customText.trim() && onCustomAction) {
            onCustomAction(customText.trim());
            setCustomText("");
            setShowCustomInput(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && inputMode === "short") {
            e.preventDefault();
            handleCustomSubmit();
        }
    };
    return (
        <div className="space-y-6">
            <h3 className="text-[#d4a76a] text-xl font-semibold mb-4 text-center">
                Choose Your Action
            </h3>

            {/* Predefined Choices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {choices.map((choice) => {
                    const Icon = iconMap[choice.icon];
                    return (
                        <Button
                            key={choice.id}
                            onClick={() => onChoiceSelect(choice.id)}
                            disabled={isLoading}
                            className="bg-gradient-to-r from-[#4a3422] to-[#5a4032] hover:from-[#6a5042] hover:to-[#7a6052] text-[#f5e6d3] border-2 border-[#d4a76a] transition-all duration-300 hover:shadow-[0_0_20px_rgba(212,167,106,0.6)] hover:scale-105 justify-start gap-3 h-auto py-5 px-5 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                        >
                            <Icon className="w-6 h-6 text-[#d4a76a] drop-shadow-sm" />
                            <span className="flex-1 text-left font-medium">
                                {choice.text}
                            </span>
                        </Button>
                    );
                })}
            </div>

            {/* Custom Action Section */}
            {onCustomAction && (
                <div className="border-t-2 border-[#d4a76a]/40 pt-6">
                    <div className="space-y-4">
                        {/* Toggle Custom Input Button */}
                        <Button
                            onClick={() => setShowCustomInput(!showCustomInput)}
                            variant="outline"
                            className="w-full bg-gradient-to-r from-[#3a2817] to-[#4a3422] hover:from-[#4a3422] hover:to-[#5a4032] text-[#d4a76a] border-2 border-[#d4a76a]/60 hover:border-[#d4a76a] transition-all duration-300 hover:shadow-[0_0_15px_rgba(212,167,106,0.3)] py-3 rounded-lg"
                        >
                            <Edit3 className="w-5 h-5 mr-2 drop-shadow-sm" />
                            <span className="font-medium">Custom Action</span>
                            {showCustomInput ? (
                                <ChevronUp className="w-5 h-5 ml-auto" />
                            ) : (
                                <ChevronDown className="w-5 h-5 ml-auto" />
                            )}
                        </Button>

                        {/* Custom Input Area */}
                        {showCustomInput && (
                            <div className="bg-gradient-to-br from-[#3a2817] to-[#2c1e12] border-2 border-[#d4a76a]/60 rounded-xl p-6 space-y-4 shadow-lg">
                                <div className="flex gap-3 mb-3">
                                    <Button
                                        size="sm"
                                        variant={
                                            inputMode === "short"
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => setInputMode("short")}
                                        className={
                                            inputMode === "short"
                                                ? "bg-[#d4a76a] text-[#2c1e12] hover:bg-[#e4b77a] font-medium px-4 py-2"
                                                : "bg-transparent border-[#d4a76a]/50 text-[#d4a76a] hover:bg-[#d4a76a]/10 px-4 py-2"
                                        }
                                    >
                                        ⚡ Quick Action
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={
                                            inputMode === "long"
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => setInputMode("long")}
                                        className={
                                            inputMode === "long"
                                                ? "bg-[#d4a76a] text-[#2c1e12] hover:bg-[#e4b77a] font-medium px-4 py-2"
                                                : "bg-transparent border-[#d4a76a]/50 text-[#d4a76a] hover:bg-[#d4a76a]/10 px-4 py-2"
                                        }
                                    >
                                        📜 Detailed Response
                                    </Button>
                                </div>

                                {inputMode === "short" ? (
                                    <div className="flex gap-3">
                                        <Input
                                            value={customText}
                                            onChange={(e) =>
                                                setCustomText(e.target.value)
                                            }
                                            onKeyPress={handleKeyPress}
                                            placeholder="Type your action (e.g., 'Look for a hidden passage', 'Ask about the mysterious sound')"
                                            disabled={isLoading}
                                            className="flex-1 bg-[#1a1105] border-2 border-[#d4a76a]/40 text-[#f5e6d3] placeholder:text-[#d4a76a]/70 focus:border-[#d4a76a] focus:ring-2 focus:ring-[#d4a76a]/20 rounded-lg px-4 py-3 text-base"
                                        />
                                        <Button
                                            onClick={handleCustomSubmit}
                                            disabled={
                                                !customText.trim() || isLoading
                                            }
                                            className="bg-gradient-to-r from-[#8b4513] to-[#a0522d] hover:from-[#a0522d] hover:to-[#b8673a] text-white px-6 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                                        >
                                            <Send className="w-5 h-5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={customText}
                                            onChange={(e) =>
                                                setCustomText(e.target.value)
                                            }
                                            placeholder="Describe your action in detail. What does your character say or do? How do they approach the situation?"
                                            disabled={isLoading}
                                            rows={4}
                                            className="bg-[#1a1105] border-2 border-[#d4a76a]/40 text-[#f5e6d3] placeholder:text-[#d4a76a]/70 focus:border-[#d4a76a] focus:ring-2 focus:ring-[#d4a76a]/20 resize-none rounded-lg px-4 py-3 text-base leading-relaxed"
                                        />
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#d4a76a]/70 font-medium">
                                                {customText.length}/500
                                                characters
                                            </span>
                                            <Button
                                                onClick={handleCustomSubmit}
                                                disabled={
                                                    !customText.trim() ||
                                                    isLoading
                                                }
                                                className="bg-gradient-to-r from-[#8b4513] to-[#a0522d] hover:from-[#a0522d] hover:to-[#b8673a] text-white px-6 py-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                                            >
                                                <Send className="w-4 h-4 mr-2" />
                                                Send Action
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-[#d4a76a]/10 border border-[#d4a76a]/30 rounded-lg p-3 mt-4">
                                    <p className="text-sm text-[#d4a76a] flex items-center gap-2">
                                        <span className="text-lg">💡</span>
                                        <span className="font-medium">
                                            Tip:
                                        </span>{" "}
                                        Custom actions give you complete
                                        freedom! Describe what your character
                                        says, does, or how they interact with
                                        the world.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
