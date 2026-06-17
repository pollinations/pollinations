// Pure game logic — ported from the web app's game/logic.ts, with the React
// hooks stripped out. `messages[]` is the single source of truth;
// computeGameState folds it into derived state. The Ink component owns the
// effects (guide messages, autonomous loop, cold open) and calls these helpers.

import { fetchFromPollinations } from "./api.js";
import { getPassengerPrompt, getPersonaPrompt } from "./prompts.js";
import {
    type Action,
    GAME_CONFIG,
    type GameState,
    type Message,
    type Persona,
    type PollingsMessage,
} from "./types.js";

// --- Message helpers --------------------------------------------------------

export const createMessage = (
    persona: Persona,
    message: string,
    action: Action = "none",
): Message => ({ persona, message, action });

const safeJsonParse = (data: string): { message: string; action?: Action } => {
    try {
        return JSON.parse(data);
    } catch {
        return { message: data };
    }
};

const isDuplicateMessage = (
    newMessage: Message,
    lastMessage: Message | undefined,
): boolean => {
    if (!lastMessage) return false;
    return JSON.stringify(newMessage) === JSON.stringify(lastMessage);
};

// Append unless it exactly repeats the previous message (mirrors the web app).
export const appendMessage = (
    messages: Message[],
    message: Message,
): Message[] => {
    const last = messages[messages.length - 1];
    return isDuplicateMessage(message, last)
        ? messages
        : [...messages, message];
};

// --- State fold -------------------------------------------------------------

const calculateNewFloor = (currentFloor: number, action: Action): number => {
    if (action === "up") return Math.min(GAME_CONFIG.FLOORS, currentFloor + 1);
    if (action === "down") return Math.max(1, currentFloor - 1);
    return currentFloor;
};

// After the swap the player IS the elevator; moves are spent per passenger
// message (fresh ch.3 budget). Before the swap, per elevator message.
const computeMovesLeft = (messages: Message[], swapped: boolean): number => {
    const spender = swapped ? "passenger" : "elevator";
    return (
        GAME_CONFIG.TOTAL_MOVES -
        messages.filter((m) => m.persona === spender).length
    );
};

export const computeGameState = (messages: Message[]): GameState => {
    let gameState: GameState = {
        currentFloor: GAME_CONFIG.INITIAL_FLOOR,
        movesLeft: GAME_CONFIG.TOTAL_MOVES,
        currentPersona: "elevator",
        firstStageComplete: false,
        hasWon: false,
        conversationMode: "interactive",
        marvinJoined: false,
        swapped: false,
        desiredFloor: 1,
    };

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

    return {
        ...gameState,
        movesLeft: computeMovesLeft(messages, gameState.swapped),
    };
};

// --- API turns --------------------------------------------------------------

const malfunction = (persona: Persona, error: unknown): Message => {
    const detail =
        error instanceof Error ? error.message : "Sub-Etha signal lost";
    return createMessage(
        persona,
        `A Sirius Cybernetics malfunction shudders through the cabin — [${detail}]. Share and Enjoy. Please try again.`,
        "none",
    );
};

// A normal persona turn (elevator / marvin / guide).
export const fetchPersonaMessage = async (
    persona: Persona,
    gameState: GameState,
    existingMessages: Message[],
    apiKey: string,
    model: string,
): Promise<Message> => {
    try {
        const messages: PollingsMessage[] = [
            { role: "system", content: getPersonaPrompt(persona, gameState) },
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

        const data = await fetchFromPollinations(messages, apiKey, model);
        const response = safeJsonParse(data.choices[0].message.content);

        return createMessage(
            persona,
            typeof response === "string" ? response : response.message,
            typeof response === "string" ? "none" : response.action || "none",
        );
    } catch (error) {
        return malfunction(persona, error);
    }
};

// Chapter 3 — true if the player ever played the towel card in chapters 1+2.
export const playerUsedTowel = (messages: Message[]): boolean =>
    messages.some(
        (m) =>
            m.persona === "user" && m.message.toLowerCase().includes("towel"),
    );

// Chapter 3 — role-swapped history: the player's own `user` lines become the
// passenger's `assistant` history (so the model reconstructs that voice); every
// other persona (the elevator the player now operates) becomes `user`.
const buildPassengerHistory = (messages: Message[]): PollingsMessage[] =>
    messages
        .filter((m) => m.persona !== "guide")
        .map((m) => ({
            role:
                m.persona === "user"
                    ? ("assistant" as const)
                    : ("user" as const),
            content:
                m.persona === "user"
                    ? JSON.stringify({ message: m.message, action: "none" })
                    : m.message,
        }));

// One passenger turn (chapter 3). System prompt is the karma-seeded passenger.
export const fetchPassengerMessage = async (
    messages: Message[],
    apiKey: string,
    model: string,
): Promise<Message> => {
    try {
        const pollingsMessages: PollingsMessage[] = [
            {
                role: "system",
                content: getPassengerPrompt(playerUsedTowel(messages)),
            },
            ...buildPassengerHistory(messages),
        ];

        const data = await fetchFromPollinations(
            pollingsMessages,
            apiKey,
            model,
        );
        const response = safeJsonParse(data.choices[0].message.content);

        return createMessage(
            "passenger",
            typeof response === "string" ? response : response.message,
            typeof response === "string" ? "none" : response.action || "none",
        );
    } catch (error) {
        return malfunction("passenger", error);
    }
};

// The last persona that actually spoke in the autonomous loop, skipping Guide
// narration. Picking the next speaker off the literal last message breaks when a
// Guide line lands between turns — Marvin would speak out of turn, soaked in
// Guide context, and stop sounding like Marvin.
export const getLastAutonomousSpeaker = (
    messages: Message[],
): "elevator" | "marvin" | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const { persona } = messages[i];
        if (persona === "elevator" || persona === "marvin") return persona;
    }
    return undefined;
};
