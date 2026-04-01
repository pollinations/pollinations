"use client";

import { useCallback, useEffect, useState } from "react";
import { ElevatorAscii } from "@/components/ElevatorAscii";
import { ElevatorShaft } from "@/components/ElevatorShaft";
import { GargleBlaster } from "@/components/GargleBlaster";
import { MessageDisplay } from "@/components/MessageDisplay";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    fetchPersonaMessage,
    useAutonomousConversation,
    useGameState,
    useGuideMessages,
    useMessageHandlers,
    useMessages,
} from "@/game/logic";
import {
    useBYOP,
    useInput,
    useMessageScroll,
    useModelSelector,
} from "@/hooks/ui";
import type { Message } from "@/types";

export default function Index() {
    const { messages, addMessage, setMessages } = useMessages();
    const gameState = useGameState(messages);
    const [inputPrompt, setInputPrompt] = useState("");
    const [gameStarted, setGameStarted] = useState(false);
    const { apiKey, profile, balance, login, logout: rawLogout } = useBYOP();
    const logout = useCallback(() => {
        rawLogout();
        setGameStarted(false);
    }, [rawLogout]);
    useModelSelector();

    useGuideMessages(gameState, messages, addMessage);
    useAutonomousConversation(gameState, messages, addMessage);

    const handleMessage = async (message: string) => {
        if (!message.trim() || gameState.movesLeft <= 0) return;
        setInputPrompt("");
        try {
            const userMessage: Message = {
                persona: "user",
                message,
                action: "none",
            };
            addMessage(userMessage);
            const response = await fetchPersonaMessage(
                gameState.currentPersona,
                gameState,
                [...messages, userMessage],
            );
            addMessage(response);
        } catch (error) {
            console.error("Error handling message:", error);
        }
    };

    const messagesEndRef = useMessageScroll(messages);
    const { inputRef } = useInput(gameState.isLoading);
    const { handleGuideAdvice, handlePersonaSwitch } = useMessageHandlers(
        gameState,
        messages,
        addMessage,
        setMessages,
    );

    useEffect(() => {
        if (!gameState.isLoading && !gameState.firstStageComplete && inputRef.current) {
            inputRef.current.focus();
        }
    }, [gameState.isLoading, gameState.firstStageComplete, inputRef.current]);

    // Auto-fetch elevator greeting when game starts
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only fire once when gameStarted flips to true
    useEffect(() => {
        if (!gameStarted || !apiKey) return;
        const fetchGreeting = async () => {
            const response = await fetchPersonaMessage("elevator", gameState, []);
            addMessage(response);
        };
        fetchGreeting();
    }, [gameStarted]);

    const hasGameMessages = messages.filter((m) => m.persona !== "guide").length > 0;

    // ─── PRE-GAME SCREEN ───
    if (!gameStarted) {
        return (
            <div className="flex flex-col items-center justify-center h-screen overflow-hidden bg-[#0a0a0f] text-green-400 p-4 font-mono">
                <Card className="w-full max-w-lg p-6 space-y-5 bg-gray-900/90 border-green-400 border-2 rounded-none flex flex-col items-center">
                    {/* User menu top-right (only when logged in) */}
                    {apiKey && (
                        <div className="w-full flex justify-end">
                            <UserMenu
                                profile={profile}
                                balance={balance}
                                apiKey={apiKey}
                                logout={logout}
                            />
                        </div>
                    )}

                    <h1 className="text-2xl font-bold text-yellow-400 text-center animate-pulse">
                        Sirius Cybernetics Corporation
                    </h1>
                    <h2 className="text-base text-green-400 text-center">
                        Happy Vertical People Transporter
                    </h2>

                    {/* ASCII elevator with legend */}
                    <pre className="text-green-400 text-xs leading-tight text-center">
                        {ElevatorAscii({
                            floor: gameState.currentFloor,
                            showLegend: true,
                            isMarvinMode: false,
                            hasMarvinJoined: false,
                        })}
                    </pre>

                    <p className="text-green-400/70 text-xs text-center max-w-sm">
                        Convince the neurotic elevator to reach the ground floor.
                        You have 15 moves. Choose your words wisely.
                    </p>

                    {apiKey ? (
                        <Button
                            onClick={() => setGameStarted(true)}
                            className="bg-green-400 text-black hover:bg-green-500 font-bold px-8 py-2 text-sm"
                        >
                            Start Game
                        </Button>
                    ) : (
                        <Button
                            onClick={login}
                            className="bg-green-400 text-black hover:bg-green-500 font-bold px-8 py-2 text-sm"
                        >
                            Log In to Play
                        </Button>
                    )}
                </Card>

                <div className="text-center text-green-400/50 mt-4 text-[10px]">
                    Powered by{" "}
                    <a href="https://pollinations.ai" className="text-blue-400/60 underline">
                        pollinations.ai
                    </a>
                </div>
            </div>
        );
    }

    // ─── IN-GAME SCREEN ───
    return (
        <div className="flex flex-col items-center justify-center h-screen overflow-hidden bg-[#0a0a0f] text-green-400 p-4 font-mono">
                <Card className="w-full max-w-2xl max-h-[90vh] p-4 space-y-3 bg-gray-900/90 border-green-400 border-2 rounded-none overflow-hidden flex flex-col">
                    {/* Top bar: charge + hint | user menu */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {/* Charge gauge */}
                            <div className="flex items-center gap-1.5 px-3 py-1 border border-yellow-400/50 bg-yellow-400/10">
                                <span className="text-lg">
                                    {gameState.movesLeft < 7 ? "\u{1FAB6}" : "\u{1F50B}"}
                                </span>
                                <span className="text-sm font-bold text-yellow-400">
                                    {gameState.movesLeft}
                                </span>
                            </div>
                            {/* Hint / Rewind button */}
                            {gameState.conversationMode === "autonomous" ? (
                                <button
                                    type="button"
                                    onClick={handlePersonaSwitch}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-yellow-400 border border-yellow-400/40 bg-yellow-400/10 hover:bg-yellow-400/20 transition-colors"
                                    title="Rewind Time"
                                >
                                    <span className="text-base">{"\u23EA"}</span>
                                    Rewind
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleGuideAdvice}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 border border-green-400/40 bg-green-400/10 hover:bg-green-400/20 transition-colors"
                                    title="Ask the Guide for advice"
                                >
                                    <span className="text-base">{"\u{1F4D6}"}</span>
                                    Hint
                                </button>
                            )}
                        </div>
                        <UserMenu
                            profile={profile}
                            balance={balance}
                            apiKey={apiKey ?? ""}
                            logout={logout}
                        />
                    </div>

                    {/* Elevator shaft with floor indicator */}
                    {!gameState.hasWon && gameState.movesLeft > 0 && (
                        <ElevatorShaft
                            currentFloor={gameState.currentFloor}
                            isMarvinMode={gameState.currentPersona === "marvin"}
                            hasMarvinJoined={gameState.marvinJoined}
                        />
                    )}

                    {/* Marvin challenge notice */}
                    {gameState.currentPersona === "marvin" && !gameState.marvinJoined && (
                        <div className="bg-pink-900/50 text-pink-200 p-2 text-xs text-center">
                            Convince Marvin to join the elevator, then reach the top floor together.
                        </div>
                    )}

                    {/* Autonomous mode notice */}
                    {gameState.conversationMode === "autonomous" && (
                        <div className="bg-blue-900/50 text-blue-200 p-2 text-xs text-center">
                            The elevator and Marvin are talking autonomously. Don't panic!
                        </div>
                    )}

                    {/* Stage complete transition */}
                    {gameState.showInstruction &&
                        gameState.currentPersona === "elevator" &&
                        gameState.firstStageComplete && (
                            <div className="bg-green-900 text-green-200 p-3 text-xs text-center space-y-2">
                                <p>
                                    <strong>Ground floor reached!</strong> Now brace yourself
                                    for <em>Marvin the Paranoid Android</em>.
                                </p>
                                <Button
                                    onClick={handlePersonaSwitch}
                                    className="bg-green-400 text-black hover:bg-green-500 text-xs py-1 px-3"
                                >
                                    Continue
                                </Button>
                            </div>
                        )}

                    {/* Win screen */}
                    {gameState.hasWon && (
                        <div className="space-y-3">
                            <div className="bg-green-900 text-green-200 p-4 text-center animate-bounce">
                                <p className="text-lg font-bold">
                                    So Long, and Thanks for All the Fish!
                                </p>
                                <p className="text-xs mt-1">
                                    You convinced Marvin to join and reached the top floor. Remarkable!
                                </p>
                            </div>
                            <GargleBlaster />
                        </div>
                    )}

                    {/* Loss screen */}
                    {!gameState.hasWon && gameState.movesLeft <= 0 && (
                        <div className="bg-red-900 text-red-200 p-4 text-center animate-bounce">
                            <p className="text-lg font-bold">Mostly Harmless</p>
                            <p className="text-xs mt-1">
                                Out of moves. Consult the Hitchhiker's Guide!
                            </p>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-1 p-2 bg-gray-800 border border-green-400">
                        {!hasGameMessages && (
                            <div className="text-green-600 text-xs text-center py-4">
                                Waiting for elevator response...
                            </div>
                        )}
                        {messages
                            .slice(1)
                            .map((msg, _index) => (
                                <MessageDisplay
                                    key={`${msg.persona}-${msg.message.slice(0, 20)}`}
                                    msg={msg}
                                    gameState={gameState}
                                />
                            ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    {gameState.conversationMode === "interactive" &&
                        !gameState.hasWon &&
                        gameState.movesLeft > 0 && (
                            <div className="flex space-x-2">
                                <Input
                                    type="text"
                                    value={inputPrompt}
                                    onChange={(e) => setInputPrompt(e.target.value)}
                                    placeholder={
                                        gameState.currentPersona === "elevator"
                                            ? "Talk to the elevator..."
                                            : "Talk to Marvin..."
                                    }
                                    onKeyPress={(e) =>
                                        e.key === "Enter" && handleMessage(inputPrompt)
                                    }
                                    className="flex-grow bg-gray-800 text-green-400 border-green-400 placeholder-green-600 text-sm"
                                    ref={inputRef}
                                    disabled={gameState.isLoading}
                                />
                                <Button
                                    onClick={() => handleMessage(inputPrompt)}
                                    className="bg-green-400 text-black hover:bg-green-500 text-sm"
                                    disabled={gameState.isLoading}
                                >
                                    {gameState.isLoading ? "..." : "Send"}
                                </Button>
                            </div>
                        )}
                </Card>

                {/* Footer */}
                <div className="text-center text-green-400/40 mt-2 text-[10px]">
                    <a href="https://pollinations.ai" className="text-blue-400/50 underline">
                        pollinations.ai
                    </a>
                </div>
            </div>
    );
}
