import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { motion } from "motion/react";
import { Dices, Skull, Sword } from "lucide-react";

interface CombatModalProps {
    open: boolean;
    onClose: () => void;
    playerHp: number;
    playerMaxHp: number;
    enemyName: string;
    enemyHp: number;
    enemyMaxHp: number;
    onAttack: () => { playerDamage: number; enemyDamage: number; playerRoll: number; enemyRoll: number };
}

export function CombatModal({
    open,
    onClose,
    playerHp,
    playerMaxHp,
    enemyName,
    enemyHp,
    enemyMaxHp,
    onAttack,
}: CombatModalProps) {
    const [combatLog, setCombatLog] = useState<string[]>([]);
    const [isRolling, setIsRolling] = useState(false);
    const [currentPlayerHp, setCurrentPlayerHp] = useState(playerHp);
    const [currentEnemyHp, setCurrentEnemyHp] = useState(enemyHp);

    const handleAttack = () => {
        setIsRolling(true);

        setTimeout(() => {
            const result = onAttack();
            const newPlayerHp = Math.max(0, currentPlayerHp - result.enemyDamage);
            const newEnemyHp = Math.max(0, currentEnemyHp - result.playerDamage);

            setCurrentPlayerHp(newPlayerHp);
            setCurrentEnemyHp(newEnemyHp);

            setCombatLog([
                `You rolled ${result.playerRoll} and dealt ${result.playerDamage} damage!`,
                `${enemyName} rolled ${result.enemyRoll} and dealt ${result.enemyDamage} damage!`,
                ...combatLog,
            ]);

            setIsRolling(false);
        }, 1000);
    };

    const playerHpPercentage = (currentPlayerHp / playerMaxHp) * 100;
    const enemyHpPercentage = (currentEnemyHp / enemyMaxHp) * 100;
    const combatEnded = currentPlayerHp <= 0 || currentEnemyHp <= 0;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#3a2817] border-4 border-[#d4a76a] text-[#f5e6d3] max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-[#d4a76a] flex items-center gap-2">
                        <Sword className="w-6 h-6" />
                        Combat Encounter
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Player HP */}
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>You</span>
                            <span>
                                {currentPlayerHp}/{playerMaxHp}
                            </span>
                        </div>
                        <Progress
                            value={playerHpPercentage}
                            className="h-4 bg-[#2c1e12]"
                            style={{
                                __progressBackground: '#8b0000',
                            } as any}
                        />
                    </div>

                    {/* Enemy HP */}
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>{enemyName}</span>
                            <span>
                                {currentEnemyHp}/{enemyMaxHp}
                            </span>
                        </div>
                        <Progress
                            value={enemyHpPercentage}
                            className="h-4 bg-[#2c1e12]"
                            style={{
                                __progressBackground: '#8b0000',
                            } as any}
                        />
                    </div>

                    {/* Dice Roll Animation */}
                    {isRolling && (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="flex justify-center py-4"
                        >
                            <Dices className="w-12 h-12 text-[#d4a76a]" />
                        </motion.div>
                    )}

                    {/* Combat Log */}
                    <div className="bg-[#2c1e12] rounded p-4 border border-[#d4a76a]/50 min-h-32 max-h-48 overflow-y-auto">
                        {combatLog.length === 0 ? (
                            <p className="text-[#b8a389] text-center">The battle begins...</p>
                        ) : (
                            <div className="space-y-2">
                                {combatLog.map((log, index) => (
                                    <motion.p
                                        key={index}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm"
                                    >
                                        {log}
                                    </motion.p>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Combat Result */}
                    {combatEnded && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center p-4 bg-[#4a3422] rounded border-2 border-[#d4a76a]"
                        >
                            {currentEnemyHp <= 0 ? (
                                <>
                                    <h3 className="text-[#d4a76a] mb-2">Victory!</h3>
                                    <p className="text-sm">You have defeated the {enemyName}!</p>
                                </>
                            ) : (
                                <>
                                    <Skull className="w-12 h-12 text-[#8b0000] mx-auto mb-2" />
                                    <h3 className="text-[#8b0000] mb-2">Defeat</h3>
                                    <p className="text-sm">You have been defeated...</p>
                                </>
                            )}
                        </motion.div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        {!combatEnded ? (
                            <Button
                                onClick={handleAttack}
                                disabled={isRolling}
                                className="flex-1 bg-[#d4a76a] hover:bg-[#c9975a] text-[#2c1e12] transition-all duration-300 hover:shadow-[0_0_15px_rgba(212,167,106,0.4)]"
                            >
                                <Dices className="w-4 h-4 mr-2" />
                                Attack
                            </Button>
                        ) : (
                            <Button
                                onClick={onClose}
                                className="flex-1 bg-[#d4a76a] hover:bg-[#c9975a] text-[#2c1e12]"
                            >
                                Continue
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
