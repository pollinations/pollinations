// Game configuration — mirrors the web app
// (apps/sirius-cybernetics-elevator-challenge/src/types.ts) so the terminal
// version plays identically. Tailwind class names are replaced with Ink colors.

export const GAME_CONFIG = {
    FLOORS: 5,
    INITIAL_FLOOR: 3,
    TOTAL_MOVES: 15,
    MARVIN_TRANSITION_MSG:
        "Marvin is waiting outside the elevator, looking particularly gloomy today...",
    SWAP_TRANSITION_MSG:
        "You drink the Pan Galactic Gargle Blaster. The universe lurches — and you wake up as the elevator, a passenger who is suspiciously like your old self stepping aboard...",
} as const;

export type Persona = "user" | "marvin" | "elevator" | "guide" | "passenger";
export type Action = "none" | "join" | "up" | "down" | "show_instructions";

// Ink color per persona (chalk/Ink color names, not tailwind classes).
export const PERSONA_COLOR: Record<Persona, string> = {
    user: "yellow",
    guide: "blue",
    elevator: "green",
    marvin: "magenta",
    passenger: "cyan",
};

export const PERSONA_LABEL: Record<Persona, string> = {
    user: "You",
    guide: "Guide",
    elevator: "Elevator",
    marvin: "Marvin",
    passenger: "Passenger",
};

export type Message = {
    persona: Persona;
    message: string;
    action: Action;
};

export type GameState = {
    currentFloor: number;
    movesLeft: number;
    currentPersona: Persona;
    firstStageComplete: boolean;
    hasWon: boolean;
    conversationMode: "interactive" | "autonomous";
    marvinJoined: boolean;
    // Chapter 3: the player has become the elevator, talking a passenger up.
    swapped: boolean;
    desiredFloor: number;
};

// OpenAI-compatible chat message for the Pollinations endpoint.
export type PollingsMessage = {
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
};

export type PollingsResponse = {
    choices: Array<{ message: { content: string } }>;
};
