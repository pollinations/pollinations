import { Button } from "./ui/button";
import { Sword, Compass, MessageCircle, Shield } from "lucide-react";

interface Choice {
    id: string;
    text: string;
    icon: "sword" | "explore" | "talk" | "defend";
}

interface ChoicesSectionProps {
    choices: Choice[];
    onChoiceSelect: (choiceId: string) => void;
}

const iconMap = {
    sword: Sword,
    explore: Compass,
    talk: MessageCircle,
    defend: Shield,
};

export function ChoicesSection({ choices, onChoiceSelect }: ChoicesSectionProps) {
    return (
        <div className="space-y-3">
            <h3 className="text-[#d4a76a] mb-4">Choose Your Action</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {choices.map((choice) => {
                    const Icon = iconMap[choice.icon];
                    return (
                        <Button
                            key={choice.id}
                            onClick={() => onChoiceSelect(choice.id)}
                            className="bg-[#3a2817] hover:bg-[#4a3422] text-[#f5e6d3] border-2 border-[#d4a76a] transition-all duration-300 hover:shadow-[0_0_15px_rgba(212,167,106,0.4)] hover:scale-105 justify-start gap-3 h-auto py-4 px-4"
                        >
                            <Icon className="w-5 h-5 text-[#d4a76a]" />
                            <span className="flex-1 text-left">{choice.text}</span>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
