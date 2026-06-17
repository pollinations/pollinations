import { useCallback, useEffect, useMemo, useState } from "react";
import {
    getFloorMessage,
    getMarvinJoinMessage,
    getPassengerPrompt,
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

// Once the swap has happened the player IS the elevator and each turn produces
// a passenger reply, so moves are spent per passenger message (a fresh budget
// for chapter 3). Before the swap, moves are spent per elevator message.
const computeMovesLeft = (messages: Message[], swapped: boolean): number => {
    const spender = swapped ? "passenger" : "elevator";
    return (
        GAME_CONFIG.TOTAL_MOVES -
        messages.filter((m) => m.persona === spender).length
    );
};

// Simplify state updates with composition
const computeGameState = (messages: Message[]): GameState => {
    const initialState: GameState = {
        currentFloor: GAME_CONFIG.INITIAL_FLOOR,
        movesLeft: GAME_CONFIG.TOTAL_MOVES,
        currentPersona: "elevator",
        firstStageComplete: false,
        hasWon: false,
        conversationMode: "interactive",
        marvinJoined: false,
        showInstruction: true,
        isLoading: false,
        swapped: false,
        desiredFloor: 1,
    };

    let gameState = initialState;
    for (const msg of messages) {
        // Only the elevator moves the physical car. Marvin may shout "up", but
        // his action never drives currentFloor — he's a passenger, not the lift.
        const newFloor =
            msg.persona === "elevator"
                ? calculateNewFloor(gameState.currentFloor, msg.action)
                : gameState.currentFloor;
        const swapped =
            gameState.swapped ||
            (msg.persona === "guide" &&
                msg.message === GAME_CONFIG.SWAP_TRANSITION_MSG);
        // Chapter 3: the passenger's own action moves their desired floor.
        const desiredFloor =
            swapped && msg.persona === "passenger"
                ? calculateNewFloor(gameState.desiredFloor, msg.action)
                : gameState.desiredFloor;
        gameState = {
            currentFloor: newFloor,
            movesLeft: gameState.movesLeft,
            showInstruction:
                msg.action === "show_instructions" || messages.length <= 3,
            isLoading: msg.persona === "user",
            currentPersona:
                msg.persona === "guide" &&
                msg.message === GAME_CONFIG.MARVIN_TRANSITION_MSG
                    ? "marvin"
                    : gameState.currentPersona,
            conversationMode:
                msg.action === "join"
                    ? "autonomous"
                    : gameState.conversationMode,
            marvinJoined: msg.action === "join" || gameState.marvinJoined,
            hasWon: swapped
                ? desiredFloor === GAME_CONFIG.FLOORS
                : gameState.marvinJoined && newFloor === GAME_CONFIG.FLOORS,
            firstStageComplete: gameState.firstStageComplete || newFloor === 1,
            swapped,
            desiredFloor,
        };
    }

    gameState = {
        ...gameState,
        movesLeft: computeMovesLeft(messages, gameState.swapped),
    };

    console.log("gameState", gameState);
    return gameState;
};

// Update the fetchPersonaMessage function
export const fetchPersonaMessage = async (
    persona: Persona,
    gameState: GameState,
    existingMessages: Message[] = [],
): Promise<Message> => {
    // Speak failures in the voice of the world: the cabin malfunctions and the
    // real upstream error rides along inside the dialogue.
    const createErrorMessage = (error: unknown): Message => {
        const detail =
            error instanceof Error ? error.message : "Sub-Etha signal lost";
        return createMessage(
            persona,
            `A Sirius Cybernetics malfunction shudders through the cabin — [${detail}]. Share and Enjoy. Please try again.`,
            "none",
        );
    };

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

// Chapter 3 — true if the player ever played the towel card in chapters 1+2.
export const playerUsedTowel = (messages: Message[]): boolean =>
    messages.some(
        (m) =>
            m.persona === "user" && m.message.toLowerCase().includes("towel"),
    );

// Chapter 3 — role-swapped history. The player's own `user` lines become the
// passenger's `assistant` history (so the model can reconstruct that voice);
// every other persona (the elevator the player now operates) becomes `user`.
// The system message is dropped here — the caller supplies the passenger prompt.
export const buildPassengerHistory = (
    messages: Message[],
): PollingsMessage[] =>
    messages
        .filter((m) => m.persona !== "guide")
        .map((m) => ({
            role: m.persona === "user" ? ("assistant" as const) : ("user" as const),
            content:
                m.persona === "user"
                    ? JSON.stringify({ message: m.message, action: "none" })
                    : m.message,
        }));

// Fetch one passenger turn. Mirrors fetchPersonaMessage but swaps roles: the
// system prompt is the passenger persona (seeded by the player's own karma) and
// the player's latest elevator line is the final `user` turn.
export const fetchPassengerMessage = async (
    messages: Message[],
): Promise<Message> => {
    const createErrorMessage = (error: unknown): Message => {
        const detail =
            error instanceof Error ? error.message : "Sub-Etha signal lost";
        return createMessage(
            "passenger",
            `A Sirius Cybernetics malfunction shudders through the cabin — [${detail}]. Share and Enjoy. Please try again.`,
            "none",
        );
    };

    try {
        const pollingsMessages: PollingsMessage[] = [
            {
                role: "system",
                content: getPassengerPrompt(playerUsedTowel(messages)),
            },
            ...buildPassengerHistory(messages),
        ];

        const data = await fetchFromPollinations(pollingsMessages);
        const response = safeJsonParse(data.choices[0].message.content);

        return createMessage(
            "passenger",
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

    // floor changed — intentionally only depend on currentFloor to avoid
    // firing on every gameState change (which caused repeated "Now arriving" spam)
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
    useEffect(() => {
        addMessage({
            persona: "guide",
            message: getFloorMessage(gameState),
            action: gameState.currentFloor === 1 ? "show_instructions" : "none",
        });
    }, [gameState.currentFloor, addMessage]);
};

// Chapter 3 cold open — once swapped, the passenger speaks first. Fires once,
// when no passenger message exists yet, demanding Floor 1 in the inferred voice.
export const usePassengerColdOpen = (
    gameState: GameState,
    messages: Message[],
    addMessage: (message: Message) => void,
) => {
    const hasPassengerMessage = messages.some((m) => m.persona === "passenger");
    useEffect(() => {
        if (!gameState.swapped || hasPassengerMessage) return;
        let cancelled = false;
        fetchPassengerMessage(messages).then((response) => {
            if (!cancelled) addMessage(response);
        });
        return () => {
            cancelled = true;
        };
    }, [gameState.swapped, hasPassengerMessage, messages, addMessage]);
};

// The last persona that actually spoke in the autonomous loop, skipping Guide
// narration ("Marvin has joined…", "Now arriving…"). Picking the next speaker
// off the literal last message breaks when a Guide line lands between turns —
// Marvin would be told to speak right after the join narration, out of turn and
// soaked in Guide context, so he stops sounding like Marvin.
const getLastAutonomousSpeaker = (
    messages: Message[],
): "elevator" | "marvin" | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const { persona } = messages[i];
        if (persona === "elevator" || persona === "marvin") return persona;
    }
    return undefined;
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

        // Marvin speaks first when he joins; thereafter they alternate by who
        // last spoke (Guide lines are ignored, so they never steal a turn).
        const nextSpeaker =
            getLastAutonomousSpeaker(messages) === "marvin"
                ? "elevator"
                : "marvin";
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
        // Transition to Marvin.
        addMessage({
            persona: "guide",
            message: GAME_CONFIG.MARVIN_TRANSITION_MSG,
            action: "none",
        });
    }, [addMessage]);

    const handleSwapSwitch = useCallback(() => {
        // Transition to chapter 3 — the player becomes the elevator.
        addMessage({
            persona: "guide",
            message: GAME_CONFIG.SWAP_TRANSITION_MSG,
            action: "none",
        });
    }, [addMessage]);

    return {
        handleGuideAdvice,
        handlePersonaSwitch,
        handleSwapSwitch,
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
