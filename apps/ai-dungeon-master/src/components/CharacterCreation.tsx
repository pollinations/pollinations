import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input";
import { Label } from "./ui/label.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea.tsx";

interface CharacterCreationProps {
    onSubmit: (character: {
        name: string;
        class: string;
        backstory: string;
    }) => Promise<void>;
    isLoading?: boolean;
}

export function CharacterCreation({
    onSubmit,
    isLoading = false,
}: CharacterCreationProps) {
    const [name, setName] = useState("");
    const [characterClass, setCharacterClass] = useState("");
    const [backstory, setBackstory] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (name && characterClass && backstory && !isLoading) {
            await onSubmit({ name, class: characterClass, backstory });
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="min-h-screen w-full relative flex items-center justify-center p-4"
            style={{
                backgroundImage:
                    "url('https://images.unsplash.com/photo-1621874771556-434338667bc5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaXN0eSUyMGZvcmVzdCUyMG1lZGlldmFsfGVufDF8fHx8MTc2MDEyMDIxOHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')",
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <div className="absolute inset-0 bg-black/60" />

            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="relative z-10 w-full max-w-2xl"
            >
                <div
                    className="relative bg-[#3a2817] rounded-lg p-8 md:p-12 shadow-2xl border-4 border-[#d4a76a]"
                    style={{
                        backgroundImage:
                            "url('https://images.unsplash.com/photo-1617565084799-c4c60ea9ad7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXJjaG1lbnQlMjBwYXBlciUyMHRleHR1cmV8ZW58MXx8fHwxNzYwMDUwNzQ0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')",
                        backgroundBlendMode: "overlay",
                        backgroundSize: "cover",
                    }}
                >
                    {/* Ornate corner decorations */}
                    <div className="absolute -top-3 -left-3 w-12 h-12 border-t-4 border-l-4 border-[#d4a76a] rounded-tl-lg" />
                    <div className="absolute -top-3 -right-3 w-12 h-12 border-t-4 border-r-4 border-[#d4a76a] rounded-tr-lg" />
                    <div className="absolute -bottom-3 -left-3 w-12 h-12 border-b-4 border-l-4 border-[#d4a76a] rounded-bl-lg" />
                    <div className="absolute -bottom-3 -right-3 w-12 h-12 border-b-4 border-r-4 border-[#d4a76a] rounded-br-lg" />

                    <h1 className="text-center mb-8 text-[#d4a76a]">
                        Create Your Hero
                    </h1>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-[#f5e6d3]">
                                Character Name
                            </Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                ) => setName(e.target.value)}
                                placeholder="Enter your hero's name..."
                                className="bg-[#2c1e12] border-[#d4a76a] text-[#f5e6d3] placeholder:text-[#b8a389] focus:ring-[#d4a76a]"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="class" className="text-[#f5e6d3]">
                                Class
                            </Label>
                            <Select
                                value={characterClass}
                                onValueChange={setCharacterClass}
                                required
                            >
                                <SelectTrigger className="bg-[#2c1e12] border-[#d4a76a] text-[#f5e6d3]">
                                    <SelectValue placeholder="Choose your path..." />
                                </SelectTrigger>
                                <SelectContent className="bg-[#3a2817] border-[#d4a76a] text-[#f5e6d3]">
                                    <SelectItem
                                        value="Warrior"
                                        className="focus:bg-[#4a3422] focus:text-[#d4a76a]"
                                    >
                                        Warrior - Master of blade and shield
                                    </SelectItem>
                                    <SelectItem
                                        value="Mage"
                                        className="focus:bg-[#4a3422] focus:text-[#d4a76a]"
                                    >
                                        Mage - Wielder of arcane power
                                    </SelectItem>
                                    <SelectItem
                                        value="Rogue"
                                        className="focus:bg-[#4a3422] focus:text-[#d4a76a]"
                                    >
                                        Rogue - Shadow walker and scout
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label
                                htmlFor="backstory"
                                className="text-[#f5e6d3]"
                            >
                                Backstory
                            </Label>
                            <Textarea
                                id="backstory"
                                value={backstory}
                                onChange={(
                                    e: React.ChangeEvent<HTMLTextAreaElement>,
                                ) => setBackstory(e.target.value)}
                                placeholder="Tell us about your character's past..."
                                className="bg-[#2c1e12] border-[#d4a76a] text-[#f5e6d3] placeholder:text-[#b8a389] min-h-32 focus:ring-[#d4a76a]"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#d4a76a] hover:bg-[#c9975a] text-[#2c1e12] transition-all duration-300 hover:shadow-[0_0_20px_rgba(212,167,106,0.5)] mt-8 py-6 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating Character...
                                </div>
                            ) : (
                                "Begin Your Journey"
                            )}
                        </Button>
                    </form>
                </div>
            </motion.div>
        </motion.div>
    );
}
