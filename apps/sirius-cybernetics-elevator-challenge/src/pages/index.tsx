"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ElevatorAscii } from "@/components/ElevatorAscii";
import { GargleBlaster } from "@/components/GargleBlaster";
import { MessageDisplay } from "@/components/MessageDisplay";
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
    AVAILABLE_MODELS,
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
    const { apiKey, login, logout } = useBYOP();
    const { model, setModel } = useModelSelector();
    const [guideLoading, setGuideLoading] = useState(false);

    useGuideMessages(gameState, messages, addMessage);
    useAutonomousConversation(gameState, messages, addMessage);

    // Message handlers
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
        // Focus input when it becomes enabled
        if (
            !gameState.isLoading &&
            !gameState.firstStageComplete &&
            inputRef.current
        ) {
            inputRef.current.focus();
        }
    }, [gameState.isLoading, gameState.firstStageComplete, inputRef.current]);

    const getInstructionMessage = () => {
        if (gameState.hasWon) return null;

        if (gameState.conversationMode === "autonomous") {
            return (
                <div className="bg-blue-900 text-blue-200 p-4 rounded-lg space-y-3">
                    <div className="flex items-center space-x-2">
                        <AlertCircle className="w-5 h-5" />
                        <div>
                            <p>
                                The conversation is now autonomous. Don't panic!
                                This is perfectly normal behavior for Sirius
                                Cybernetics products.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        if (gameState.currentPersona === "marvin" && !gameState.marvinJoined) {
            return (
                <div className="bg-pink-900/50 text-pink-200 p-4 rounded-lg flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5" />
                    <p>
                        New challenge: First convince Marvin the Paranoid
                        Android to join you in the elevator, then together reach
                        the top floor! Warning: Marvin's pessimism might affect
                        the elevator's behavior...
                    </p>
                </div>
            );
        }

        // Only show initial instruction if we're at the start (messages.length <= 1)
        if (messages.length <= 1) {
            return (
                <div className="bg-blue-900 text-blue-200 p-4 rounded-lg space-y-3">
                    <div className="flex items-center space-x-2">
                        <AlertCircle className="w-5 h-5" />
                        <div>
                            <p>
                                Psst! Your mission: Convince this neurotic
                                elevator to reach the ground floor. Remember
                                your towel!
                            </p>
                            {gameState.showInstruction &&
                                gameState.currentPersona === "elevator" &&
                                !gameState.firstStageComplete && (
                                    <p className="text-yellow-200 font-bold border-t border-blue-700 mt-3 pt-3">
                                        <strong>Sub-etha News Flash:</strong>{" "}
                                        New Genuine People Personalities™
                                        scenarios detected in building
                                        mainframe. Prepare for Marvin!
                                    </p>
                                )}
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-green-400 p-4 font-mono">
            <Card className="w-full max-w-2xl p-6 space-y-6 bg-gray-900 border-green-400 border-2 rounded-none relative">
                {/* Sub-Etha Auth Status — top right */}
                <div className="absolute top-2 right-3">
                    {apiKey ? (
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-green-600">
                                Sub-Etha: ...{apiKey.slice(-5)}
                            </span>
                            <button
                                type="button"
                                onClick={logout}
                                className="text-xs text-red-400 hover:text-red-300 underline"
                            >
                                disconnect
                            </button>
                        </div>
                    ) : (
                        <span className="text-xs text-gray-600">offline</span>
                    )}
                </div>

                <div className="text-center space-y-4">
                    <h1 className="text-3xl font-bold text-yellow-400 animate-pulse">
                        <a
                            href="https://websim.ai/c/FAflFDzXEC1ABzFvz"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Sirius Cybernetics Corporation
                        </a>
                    </h1>
                    <h2 className="text-xl font-semibold text-green-400">
                        Happy Vertical People Transporter
                    </h2>

                    {!apiKey && (
                        <div className="space-y-4 py-6">
                            <p className="text-sm text-blue-300">
                                To operate this Genuine People
                                Personality&trade; elevator, you must first
                                register on the Sub-Etha Net.
                            </p>
                            <Button
                                onClick={login}
                                className="bg-green-700 text-green-100 hover:bg-green-600 border border-green-400 text-sm py-2 px-4"
                            >
                                Login with Pollinations
                            </Button>
                            <p className="text-xs text-gray-500">
                                DON'T PANIC — it's free and takes 10 seconds.
                            </p>
                        </div>
                    )}

                    {/* Model Selector — shown when logged in, before game starts */}
                    {apiKey && messages.length <= 1 && (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-500">
                                Deep Thought Personality&trade;
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {AVAILABLE_MODELS.map((m) => (
                                    <button
                                        type="button"
                                        key={m.id}
                                        onClick={() => setModel(m.id)}
                                        className={`text-xs px-3 py-1 border rounded ${
                                            model === m.id
                                                ? "border-green-400 text-green-400 bg-green-900/30"
                                                : "border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300"
                                        }`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {apiKey && (
                    <>
                        <div className="text-center space-y-4">
                            {/* Add moves remaining display */}
                            {messages.length > 0 && (
                                <div className="text-sm text-yellow-400">
                                    Charge Remaining:{" "}
                                    <b>{gameState.movesLeft}</b>{" "}
                                    {gameState.movesLeft < 7 ? "🪫" : "🔋"}
                                </div>
                            )}

                            {getInstructionMessage()}

                            <Button
                                onClick={async () => {
                                    if (
                                        gameState.conversationMode ===
                                        "autonomous"
                                    ) {
                                        handlePersonaSwitch();
                                    } else {
                                        setGuideLoading(true);
                                        await handleGuideAdvice();
                                        setGuideLoading(false);
                                    }
                                }}
                                className={`${
                                    gameState.conversationMode === "autonomous"
                                        ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                                        : "bg-gray-700 text-green-400 hover:bg-gray-600"
                                } text-xs py-1 px-2`}
                                disabled={guideLoading || gameState.isLoading}
                            >
                                {guideLoading
                                    ? "Consulting the Guide..."
                                    : gameState.conversationMode ===
                                        "autonomous"
                                      ? "Rewind Time"
                                      : "Don't Panic!"}
                            </Button>
                        </div>

                        {gameState.showInstruction &&
                            gameState.currentPersona === "elevator" &&
                            gameState.firstStageComplete && (
                                <div className="bg-green-900 text-green-200 p-4 rounded-lg flex items-center space-x-2">
                                    <AlertCircle className="w-5 h-5" />
                                    <p>
                                        <strong>Congratulations!</strong> You've
                                        successfully navigated the neurotic
                                        elevator to the ground floor.
                                        <br />
                                        <br />
                                        Now, brace yourself for the next
                                        challenge:{" "}
                                        <em>Marvin the Paranoid Android</em>{" "}
                                        awaits.
                                        <br />
                                        <br />
                                        <Button
                                            onClick={handlePersonaSwitch}
                                            className="bg-green-400 text-black hover:bg-green-500 text-xs py-1 px-2"
                                        >
                                            Confirm
                                        </Button>
                                    </p>
                                </div>
                            )}

                        {(gameState.currentPersona === "elevator" ||
                            gameState.currentPersona === "marvin") &&
                            !gameState.hasWon && (
                                <pre className="text-green-400 text-center">
                                    {ElevatorAscii({
                                        floor: gameState.currentFloor,
                                        showLegend: gameState.showInstruction,
                                        isMarvinMode:
                                            gameState.currentPersona ===
                                            "marvin",
                                        hasMarvinJoined: gameState.marvinJoined,
                                    })}
                                </pre>
                            )}
                        {messages.length > 1 && (
                            <>
                                {" "}
                                {gameState.hasWon && (
                                    <div className="space-y-4">
                                        <div className="bg-green-900 text-green-200 p-4 rounded-lg text-center animate-bounce">
                                            <p className="text-xl font-bold">
                                                So Long, and Thanks for All the
                                                Fish!
                                            </p>
                                            <p>
                                                You've successfully convinced
                                                Marvin to join you and reached
                                                the top floor together. Even if
                                                Marvin thinks it was all
                                                pointless, you've done a
                                                remarkable job!
                                            </p>
                                        </div>
                                        <GargleBlaster />
                                    </div>
                                )}
                                {!gameState.hasWon &&
                                    gameState.movesLeft <= 0 && (
                                        <div className="bg-red-900 text-red-200 p-4 rounded-lg text-center animate-bounce">
                                            <p className="text-xl font-bold">
                                                Mostly Harmless
                                            </p>
                                            <p>
                                                You've run out of moves. Time to
                                                consult your copy of the
                                                Hitchhiker's Guide to the
                                                Galaxy!
                                            </p>
                                        </div>
                                    )}
                                <div className="h-64 overflow-y-auto space-y-2 p-2 bg-gray-800 border border-green-400">
                                    {messages
                                        // remove first message
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
                                {gameState.conversationMode ===
                                    "interactive" && (
                                    <div className="flex space-x-2">
                                        <Input
                                            type="text"
                                            value={inputPrompt}
                                            onChange={(e) =>
                                                setInputPrompt(e.target.value)
                                            }
                                            placeholder={
                                                gameState.currentPersona ===
                                                "elevator"
                                                    ? "Communicate with the elevator..."
                                                    : "Try to convince Marvin..."
                                            }
                                            onKeyPress={(e) =>
                                                e.key === "Enter" &&
                                                handleMessage(inputPrompt)
                                            }
                                            className="flex-grow bg-gray-800 text-green-400 border-green-400 placeholder-green-600"
                                            ref={inputRef}
                                            disabled={gameState.isLoading}
                                        />
                                        <Button
                                            onClick={() =>
                                                handleMessage(inputPrompt)
                                            }
                                            className="bg-green-400 text-black hover:bg-green-500"
                                            disabled={gameState.isLoading}
                                        >
                                            {gameState.isLoading
                                                ? "Processing..."
                                                : "Send"}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </Card>

            {/* Attribution */}
            <div className="text-center text-green-400 mt-4 text-xs max-w-xl space-y-1">
                <p>
                    Powered by{" "}
                    <a
                        href="https://pollinations.ai"
                        className="text-blue-400 underline"
                    >
                        pollinations.ai
                    </a>
                </p>
                <p>
                    <a
                        href="https://github.com/pollinations/pollinations/tree/main/apps/sirius-cybernetics-elevator-challenge"
                        className="text-gray-500 hover:text-gray-400 underline"
                    >
                        Fork the source code
                    </a>
                </p>
            </div>
        </div>
    );
}
