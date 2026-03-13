import { useCallback, useEffect, useMemo, useState } from "react";
import {
    getFloorMessage,
    getMarvinJoinMessage,
    getPersonaPrompt,
} from "@/prompts";
import {
    type Action,
    GAME_CONFIG,
    type GameState,
    type Message,
    type Persona,
    type PollingsMessage,
} from "@/types";
import { fetchFromPollinations } from "@/utils/api";
import { findMarvinJoinStartIndex, rewindMessages } from "./rewind";

// Core message management hook
export const useMessages = () => {
    const [messages, setMessages] = useState<Message[]>([]);

    const addMessage = useCallback((message: Message) => {
        setMessages(appendIfNotDuplicate(message));
    }, []);

    return { messages, addMessage, setMessages };
};

// Extract duplicate check logic
const isDuplicateMessage = (
    newMessage: Message,
    lastMessage: Message | undefined,
): boolean => {
    if (!lastMessage) return false;
    return JSON.stringify(newMessage) === JSON.stringify(lastMessage);
};

// Simplify message append logic
const appendIfNotDuplicate = (message: Message) => {
    return (messages: Message[]) => {
        const lastMessage = messages[messages.length - 1];
        return isDuplicateMessage(message, lastMessage)
            ? messages
            : [...messages, message];
    };
};

// Extract floor calculation logic
const calculateNewFloor = (currentFloor: number, action: Action): number => {
    if (action === "up") return Math.min(GAME_CONFIG.FLOORS, currentFloor + 1);
    if (action === "down") return Math.max(1, currentFloor - 1);
    return currentFloor;
};

// Simplify state updates with composition
const computeGameState = (messages: Message[]): GameState => {
    const initialState: GameState = {
        currentFloor: GAME_CONFIG.INITIAL_FLOOR,
        movesLeft:
            GAME_CONFIG.TOTAL_MOVES -
            messages.filter((m) => m.persona === "elevator").length,
        currentPersona: "elevator",
        firstStageComplete: false,
        hasWon: false,
        conversationMode: "interactive",
        marvinJoined: false,
        showInstruction: true,
        isLoading: false,
    };

    const gameState = messages.reduce<GameState>((state, msg) => {
        const newFloor = calculateNewFloor(state.currentFloor, msg.action);

        return {
            ...state,
            currentFloor: newFloor,
            showInstruction:
                msg.action === "show_instructions" || messages.length <= 3,
            isLoading: msg.persona === "user",
            currentPersona:
                msg.persona === "guide" &&
                msg.message === GAME_CONFIG.MARVIN_TRANSITION_MSG
                    ? "marvin"
                    : state.currentPersona,
            conversationMode:
                msg.action === "join" ? "autonomous" : state.conversationMode,
            marvinJoined: msg.action === "join" || state.marvinJoined,
            hasWon: state.marvinJoined && newFloor === GAME_CONFIG.FLOORS,
            firstStageComplete: state.firstStageComplete || newFloor === 1,
        };
    }, initialState);

    console.log("gameState", gameState);
    return gameState;
};

// Update the fetchPersonaMessage function
export const fetchPersonaMessage = async (
    persona: Persona,
    gameState: GameState,
    existingMessages: Message[] = [],
): Promise<Message> => {
    const createErrorMessage = (_error: unknown): Message =>
        createMessage(
            persona,
            "Apologies, I'm experiencing some difficulties.",
            "none",
        );

    try {
        const messages: PollingsMessage[] = [
            {
                role: "system",
                content: getPersonaPrompt(persona, gameState),
            },
            ...existingMessages.map((msg) => ({
                role:
                    msg.persona === "user"
                        ? ("user" as const)
                        : ("assistant" as const),
                content: JSON.stringify({
                    message: msg.message,
                    action: msg.action,
                }),
                ...(msg.persona !== "user" && { name: msg.persona }),
            })),
        ];

        const data = await fetchFromPollinations(messages);
        const response = safeJsonParse(data.choices[0].message.content);

        return createMessage(
            persona,
            typeof response === "string" ? response : response.message,
            typeof response === "string" ? "none" : response.action || "none",
        );
    } catch (error) {
        console.error("Error:", error);
        return createErrorMessage(error);
    }
};

// Game state management hook
export const useGameState = (messages: Message[]) => {
    return useMemo(() => computeGameState(messages), [messages]);
};

// Effect hook for guide messages
export const useGuideMessages = (
    gameState: GameState,
    messages: Message[],
    addMessage: (message: Message) => void,
) => {
    const lastMessage = messages[messages.length - 1];

    // marvin joined
    useEffect(() => {
        if (lastMessage?.action === "join" && !gameState.marvinJoined) {
            addMessage({
                persona: "guide",
                message: getMarvinJoinMessage(),
                action: "none",
            });
        }
    }, [lastMessage, addMessage, gameState.marvinJoined]);

    // floor changed
    useEffect(() => {
        addMessage({
            persona: "guide",
            message: getFloorMessage(gameState),
            action: gameState.currentFloor === 1 ? "show_instructions" : "none",
        });
    }, [gameState.currentFloor, addMessage, gameState]);
};

// Autonomous conversation hook
export const useAutonomousConversation = (
    gameState: GameState,
    messages: Message[],
    addMessage: (message: Message) => void,
) => {
    useEffect(() => {
        if (
            gameState.conversationMode !== "autonomous" ||
            messages.length === 0
        )
            return;

        const lastMessage = messages[messages.length - 1];
        const nextSpeaker =
            lastMessage.persona === "marvin" ? "elevator" : "marvin";
        const delay = 1000 + messages.length * 250;

        const timer = setTimeout(async () => {
            const response = await fetchPersonaMessage(
                nextSpeaker,
                gameState,
                messages,
            );
            addMessage(response);
        }, delay);

        return () => clearTimeout(timer);
    }, [messages, gameState, addMessage]);
};

export const useMessageHandlers = (
    gameState: GameState,
    messages: Message[],
    addMessage: (message: Message) => void,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
) => {
    const handleGuideAdvice = useCallback(async () => {
        if (gameState.isLoading) return;

        try {
            const response = await fetchPersonaMessage(
                "guide",
                gameState,
                messages,
            );
            addMessage(response);
        } catch (error) {
            console.error("Error fetching guide advice:", error);
        }
    }, [gameState, messages, addMessage]);

    const handlePersonaSwitch = useCallback(() => {
        if (gameState.conversationMode === "autonomous") {
            // Rewind functionality with animation
            const rewindIndex = findMarvinJoinStartIndex(messages);
            if (rewindIndex !== -1) {
                rewindMessages(messages, rewindIndex, setMessages);
            }
        } else {
            // Original transition to Marvin functionality
            addMessage({
                persona: "guide",
                message: GAME_CONFIG.MARVIN_TRANSITION_MSG,
                action: "none",
            });
        }
    }, [messages, gameState.conversationMode, setMessages, addMessage]);

    return {
        handleGuideAdvice,
        handlePersonaSwitch,
    };
};

// At the top of the file, add these message factory functions
const createMessage = (
    persona: Persona,
    message: string,
    action: Action = "none",
): Message => ({
    persona,
    message,
    action,
});

const safeJsonParse = (data: string): { message: string; action?: Action } => {
    try {
        return JSON.parse(data);
    } catch (error) {
        console.error("JSON parse error:", error);
        return { message: data };
    }
};
