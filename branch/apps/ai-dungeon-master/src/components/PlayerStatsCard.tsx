import { Progress } from "./ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { User, Heart, Sparkles } from "lucide-react";

interface PlayerStatsCardProps {
    character: {
        name: string;
        class: string;
        backstory: string;
        level: number;
        hp: number;
        maxHp: number;
        mana: number;
        maxMana: number;
        avatar?: string;
    };
}

export function PlayerStatsCard({ character }: PlayerStatsCardProps) {
    const hpPercentage = (character.hp / character.maxHp) * 100;
    const manaPercentage = (character.mana / character.maxMana) * 100;

    return (
        <div className="bg-[#3a2817] rounded-lg p-4 border-2 border-[#d4a76a] shadow-lg">
            <div className="flex items-start gap-4">
                <Avatar className="w-16 h-16 border-2 border-[#d4a76a]">
                    {character.avatar && (
                        <AvatarImage
                            src={character.avatar}
                            alt={`${character.name} the ${character.class}`}
                            className="object-cover"
                        />
                    )}
                    <AvatarFallback className="bg-[#2c1e12] text-[#d4a76a]">
                        <User className="w-8 h-8" />
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="cursor-help">
                                        <h3 className="text-[#d4a76a]">{character.name}</h3>
                                        <p className="text-sm text-[#b8a389]">
                                            Level {character.level} {character.class}
                                        </p>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-[#3a2817] border-[#d4a76a] text-[#f5e6d3] max-w-xs">
                                    <p>{character.backstory}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-[#8b0000]" />
                            <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-[#f5e6d3]">HP</span>
                                    <span className="text-xs text-[#f5e6d3]">
                                        {character.hp}/{character.maxHp}
                                    </span>
                                </div>
                                <Progress
                                    value={hpPercentage}
                                    className="h-2 bg-[#2c1e12]"
                                    style={{
                                        __progressBackground: '#8b0000',
                                    } as any}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#4169e1]" />
                            <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-[#f5e6d3]">Mana</span>
                                    <span className="text-xs text-[#f5e6d3]">
                                        {character.mana}/{character.maxMana}
                                    </span>
                                </div>
                                <Progress
                                    value={manaPercentage}
                                    className="h-2 bg-[#2c1e12]"
                                    style={{
                                        __progressBackground: '#4169e1',
                                    } as any}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
