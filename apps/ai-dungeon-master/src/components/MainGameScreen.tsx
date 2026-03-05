import { useState } from "react";
import { motion } from "motion/react";
import { PlayerStatsCard } from "./PlayerStatsCard";
import { SceneArea } from "./SceneArea";
import { StoryText } from "./StoryText";
import { ChoicesSection } from "./ChoicesSection";
import { InventoryGrid, type InventoryItem } from "./InventoryGrid";
import { InventoryModal } from "./InventoryModal";
import { Button } from "./ui/button";
import { Backpack, Dices, Save, Loader2, ScrollText, Images, Swords, Shield, Skull } from "lucide-react";

interface Character {
    name: string;
    class: string;
    backstory: string;
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    avatar?: string;
}

interface GameChoice {
    id: number;
    text: string;
    consequence?: string;
}

interface Enemy {
    name: string;
    type: string;
    hp: number;
    maxHp: number;
    attackPower: number;
    description: string;
}

interface GameScene {
    description: string;
    image: string;
    mood: 'peaceful' | 'tense' | 'combat' | 'mysterious' | 'joyful';
    enemy?: Enemy;
}

interface MainGameScreenProps {
    character: Character;
    scene: GameScene;
    choices: GameChoice[];
    inventory: InventoryItem[];
    isLoading: boolean;
    onChoice: (choice: GameChoice) => Promise<void>;
    onCombat: () => Promise<{ playerRoll: number; enemyRoll: number; playerSuccess: boolean; enemyDefeated: boolean; combatResult: string; } | null>;
    onSave: () => void;
    isSaving?: boolean;
    saveStatus?: 'idle' | 'confirm' | 'uploading' | 'done' | 'error';
    pendingUploadCount?: number;
    onConfirmSave?: () => void;
    onSkipUpload?: () => void;
    onViewStoryHistory?: () => void;
    onViewGallery?: () => void;
}

export function MainGameScreen({
    character,
    scene,
    choices,
    inventory,
    isLoading,
    onChoice,
    onCombat,
    onSave,
    isSaving,
    saveStatus,
    pendingUploadCount,
    onConfirmSave,
    onSkipUpload,
    onViewStoryHistory,
    onViewGallery,
}: MainGameScreenProps) {
    const [inventoryOpen, setInventoryOpen] = useState(false);
    const [combatOpen, setCombatOpen] = useState(false);
    const [combatResult, setCombatResult] = useState<{
        playerRoll: number;
        enemyRoll: number;
        playerSuccess: boolean;
        enemyDefeated: boolean;
        combatResult: string;
    } | null>(null);

    // Assign icons based on choice text content
    const getChoiceIcon = (text: string): "sword" | "explore" | "talk" | "defend" => {
        const lower = text.toLowerCase();
        if (lower.match(/attack|fight|strike|slay|kill|battle|draw.*sword|weapon/)) return "sword";
        if (lower.match(/defend|block|shield|protect|brace|dodge|parry/)) return "defend";
        if (lower.match(/talk|speak|ask|negotiate|persuade|convince|greet|say|tell|plead|call|shout|whisper/)) return "talk";
        return "explore";
    };

    const formattedChoices = choices.map(choice => ({
        id: choice.id.toString(),
        text: choice.text,
        icon: getChoiceIcon(choice.text),
    }));

    // Use inventory directly since interfaces now match
    const formattedInventory = inventory;

    const handleChoiceSelect = async (choiceId: string) => {
        const selectedChoice = choices.find(choice => choice.id.toString() === choiceId);
        if (selectedChoice && !isLoading) {
            await onChoice(selectedChoice);
        }
    };

    const handleCustomAction = async (customText: string) => {
        if (!isLoading && customText.trim()) {
            // Create a custom choice object for the custom action
            const customChoice = {
                id: 999, // Special ID for custom actions
                text: customText.trim()
            };
            await onChoice(customChoice);
        }
    };

    const handleCombat = () => {
        setCombatOpen(true);
    };

    const handleAttack = async () => {
        const result = await onCombat();
        if (result) {
            setCombatResult(result);
            setCombatOpen(false); // Close combat modal after attack
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="min-h-screen w-full bg-[#2c1e12] p-4 md:p-6"
        >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header with Stats */}
                <PlayerStatsCard character={character} />

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Scene and Choices */}
                    <div className="lg:col-span-2 space-y-6">
                        <SceneArea
                            imageUrl={scene.image}
                        />

                        <StoryText
                            text={scene.description}
                            isLoading={isLoading}
                        />

                        <div className="bg-[#3a2817] rounded-lg p-6 border-2 border-[#d4a76a]">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#d4a76a]" />
                                    <span className="ml-2 text-[#f5e6d3]">Loading next adventure...</span>
                                </div>
                            ) : (
                                <ChoicesSection
                                    choices={formattedChoices}
                                    onChoiceSelect={handleChoiceSelect}
                                    onCustomAction={handleCustomAction}
                                    isLoading={isLoading}
                                />
                            )}
                        </div>
                    </div>

                    {/* Sidebar - Inventory and Actions */}
                    <div className="space-y-6">
                        {/* Quick Inventory */}
                        <div className="bg-[#3a2817] rounded-lg p-4 border-2 border-[#d4a76a]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[#d4a76a]">Inventory ({inventory.length})</h3>
                                <Button
                                    onClick={() => setInventoryOpen(true)}
                                    variant="ghost"
                                    size="sm"
                                    className="text-[#d4a76a] hover:text-[#e5b77b] hover:bg-[#4a3422]"
                                >
                                    <Backpack className="w-4 h-4 mr-2" />
                                    View All
                                </Button>
                            </div>
                            <InventoryGrid items={formattedInventory} compact />
                        </div>

                        {/* Action Buttons */}
                        <div className="bg-[#3a2817] rounded-lg p-4 border-2 border-[#d4a76a] space-y-3">
                            <h3 className="text-[#d4a76a] mb-4">Actions</h3>

                            <Button
                                onClick={handleCombat}
                                className="w-full bg-[#8b0000] hover:bg-[#a00000] text-[#f5e6d3] transition-all duration-300 hover:shadow-[0_0_15px_rgba(139,0,0,0.4)] justify-start gap-3"
                            >
                                <Dices className="w-5 h-5" />
                                Enter Combat
                            </Button>

                            {saveStatus === 'confirm' ? (
                                <div className="w-full bg-[#3a2817] border border-[#d4a76a] rounded-lg p-3 space-y-2">
                                    <p className="text-[#f5e6d3] text-sm">
                                        Save & upload <strong className="text-[#d4a76a]">{pendingUploadCount}</strong> image{pendingUploadCount !== 1 ? 's' : ''}?
                                        <span className="block text-[#b8a389] text-xs mt-1">Images will be stored permanently</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={onConfirmSave}
                                            size="sm"
                                            className="flex-1 bg-[#d4a76a] text-[#2c1e12] hover:bg-[#e5b77b]"
                                        >
                                            Upload & Save
                                        </Button>
                                        <Button
                                            onClick={onSkipUpload}
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 border-[#d4a76a] text-[#d4a76a] hover:bg-[#4a3422]"
                                        >
                                            Save Only
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={onSave}
                                    disabled={isSaving}
                                    className="w-full bg-[#4a3422] hover:bg-[#5a4332] text-[#f5e6d3] border border-[#d4a76a] justify-start gap-3 disabled:opacity-50"
                                >
                                    {saveStatus === 'uploading' ? (
                                        <Loader2 className="w-5 h-5 text-[#d4a76a] animate-spin" />
                                    ) : (
                                        <Save className="w-5 h-5 text-[#d4a76a]" />
                                    )}
                                    {saveStatus === 'uploading' ? 'Uploading images…'
                                        : saveStatus === 'done' ? 'Saved ✓'
                                        : saveStatus === 'error' ? 'Error — try again'
                                        : 'Save Game'}
                                </Button>
                            )}

                            <Button
                                onClick={onViewStoryHistory}
                                className="w-full bg-[#4a3422] hover:bg-[#5a4332] text-[#f5e6d3] border border-[#d4a76a] justify-start gap-3"
                            >
                                <ScrollText className="w-5 h-5 text-[#d4a76a]" />
                                View Story History
                            </Button>

                            <Button
                                onClick={onViewGallery}
                                className="w-full bg-[#4a3422] hover:bg-[#5a4332] text-[#f5e6d3] border border-[#d4a76a] justify-start gap-3"
                            >
                                <Images className="w-5 h-5 text-[#d4a76a]" />
                                Gallery
                            </Button>

                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <InventoryModal
                open={inventoryOpen}
                onClose={() => setInventoryOpen(false)}
                items={formattedInventory}
            />

            {/* Combat Modal */}
            {combatOpen && scene.enemy && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
                >
                    <motion.div
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="bg-[#2c1e12] border-4 border-[#8b0000] rounded-lg p-8 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(139,0,0,0.4)]"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <Skull className="w-7 h-7 text-[#8b0000]" />
                            <h2 className="text-[#d4a76a] text-xl font-bold">Combat!</h2>
                        </div>
                        <p className="text-[#f5e6d3] mb-2 text-lg">{scene.enemy.name}</p>
                        <p className="text-[#b8a389] text-sm mb-6">{scene.enemy.description}</p>
                        <div className="flex gap-3">
                            <Button
                                onClick={handleAttack}
                                className="flex-1 bg-[#8b0000] hover:bg-[#a00000] text-[#f5e6d3] py-5 gap-2 transition-all hover:shadow-[0_0_20px_rgba(139,0,0,0.5)]"
                            >
                                <Swords className="w-5 h-5" />
                                Attack
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setCombatOpen(false)}
                                className="flex-1 border-[#d4a76a] text-[#d4a76a] py-5 gap-2 hover:bg-[#4a3422]"
                            >
                                <Shield className="w-5 h-5" />
                                Flee
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* Combat Result Display */}
            {combatResult && (
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -50 }}
                    className="fixed bottom-4 right-4 bg-[#3a2817] border-2 border-[#d4a76a] rounded-lg p-4 shadow-xl"
                >
                    <h4 className="text-[#d4a76a] font-semibold mb-2">Combat Result</h4>
                    <p className="text-[#f5e6d3] text-sm">
                        Player Roll: {combatResult.playerRoll}<br />
                        Enemy Roll: {combatResult.enemyRoll}<br />
                        {combatResult.playerSuccess ? (
                            <span className="text-green-400">Victory! {combatResult.combatResult}</span>
                        ) : (
                            <span className="text-red-400">Defeat! {combatResult.combatResult}</span>
                        )}
                    </p>
                    <Button
                        onClick={() => setCombatResult(null)}
                        size="sm"
                        className="mt-2 bg-[#d4a76a] text-[#2c1e12] hover:bg-[#e5b77b]"
                    >
                        Close
                    </Button>
                </motion.div>
            )}
        </motion.div>
    );
}
