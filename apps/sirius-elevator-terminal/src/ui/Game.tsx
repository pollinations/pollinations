// The game screen. Mirrors the web app's index.tsx: `messages` is the single
// source of truth, gameState is derived, and effects drive guide narration, the
// autonomous Marvin↔elevator loop, the chapter transitions, and the ch.3 cold
// open. Chapter-transition "Confirm" buttons become a "press Enter" banner.

import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBalance, fetchProfile } from "../auth.js";
import {
    appendMessage,
    computeGameState,
    createMessage,
    fetchPassengerMessage,
    fetchPersonaMessage,
    getLastAutonomousSpeaker,
} from "../game.js";
import { getFloorMessage, getMarvinJoinMessage } from "../prompts.js";
import { GAME_CONFIG, type Message } from "../types.js";
import { Header } from "./Header.js";
import { Transcript } from "./Transcript.js";

type GameProps = { apiKey: string; model: string };

// A blue/cyan banner with an optional "press Enter" gate for chapter changes.
function Banner({
    color,
    children,
}: {
    color: string;
    children: React.ReactNode;
}) {
    return (
        <Box
            borderStyle="round"
            borderColor={color}
            paddingX={1}
            marginTop={1}
            flexDirection="column"
        >
            {children}
        </Box>
    );
}

export function Game({ apiKey, model }: GameProps) {
    const { exit } = useApp();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState<string | null>(null);
    const [balance, setBalance] = useState<number | null>(null);

    const gameState = useMemo(() => computeGameState(messages), [messages]);

    // Guards so each one-shot effect fires exactly once.
    const kickedOff = useRef(false);
    const lastFloor = useRef<number | null>(null);
    const joinNarrated = useRef(false);
    const coldOpened = useRef(false);
    const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const add = useCallback((m: Message) => {
        setMessages((prev) => appendMessage(prev, m));
    }, []);

    // Profile + balance for the header (once).
    useEffect(() => {
        fetchProfile(apiKey).then((p) =>
            setUsername(p?.githubUsername ?? null),
        );
        fetchBalance(apiKey).then(setBalance);
    }, [apiKey]);

    // Kickoff: the Guide announces the starting floor, exactly like the web app
    // (useGuideMessages fires on the initial currentFloor at mount).
    useEffect(() => {
        if (kickedOff.current) return;
        kickedOff.current = true;
        lastFloor.current = gameState.currentFloor;
        add(
            createMessage(
                "guide",
                getFloorMessage(gameState),
                gameState.currentFloor === 1 ? "show_instructions" : "none",
            ),
        );
    }, [add, gameState]);

    // Guide narrates each time the physical floor changes (not on every state
    // change — that caused "Now arriving" spam in the web app).
    useEffect(() => {
        if (!kickedOff.current) return;
        if (lastFloor.current === gameState.currentFloor) return;
        lastFloor.current = gameState.currentFloor;
        add(
            createMessage(
                "guide",
                getFloorMessage(gameState),
                gameState.currentFloor === 1 ? "show_instructions" : "none",
            ),
        );
    }, [add, gameState]);

    // Guide narrates Marvin boarding, once.
    useEffect(() => {
        if (gameState.marvinJoined && !joinNarrated.current) {
            joinNarrated.current = true;
            add(createMessage("guide", getMarvinJoinMessage(), "none"));
        }
    }, [add, gameState.marvinJoined]);

    // Autonomous loop: once Marvin joins, he and the elevator talk to each
    // other. Next speaker is whoever did NOT speak last (Guide lines ignored).
    // Chapter 3 takes over once swapped — the passenger + player drive the turns,
    // so the Marvin↔elevator loop must stop (conversationMode stays "autonomous"
    // from ch.2 and never resets on its own).
    useEffect(() => {
        if (gameState.conversationMode !== "autonomous") return;
        if (gameState.swapped || gameState.hasWon || gameState.movesLeft <= 0)
            return;
        if (messages.length === 0) return;

        const nextSpeaker =
            getLastAutonomousSpeaker(messages) === "marvin"
                ? "elevator"
                : "marvin";
        const delay = 1000 + messages.length * 150;

        autoTimer.current = setTimeout(async () => {
            const response = await fetchPersonaMessage(
                nextSpeaker,
                gameState,
                messages,
                apiKey,
                model,
                true, // autonomous: react to the other robot, don't mirror it
            );
            add(response);
        }, delay);

        return () => {
            if (autoTimer.current) clearTimeout(autoTimer.current);
        };
    }, [messages, gameState, add, apiKey, model]);

    // Chapter 3 cold open: the passenger speaks first, demanding Floor 1.
    useEffect(() => {
        if (!gameState.swapped || coldOpened.current) return;
        if (messages.some((m) => m.persona === "passenger")) return;
        coldOpened.current = true;
        (async () => {
            const response = await fetchPassengerMessage(
                messages,
                apiKey,
                model,
            );
            add(response);
        })();
    }, [add, gameState.swapped, messages, apiKey, model]);

    // Whether the player can type this turn.
    const canType =
        !loading &&
        !gameState.hasWon &&
        gameState.movesLeft > 0 &&
        (gameState.conversationMode === "interactive" || gameState.swapped);

    // Chapter transitions are gated on a "press Enter" banner (the web Confirm
    // button). These flags decide which banner, if any, is showing.
    const showMarvinGate =
        gameState.firstStageComplete &&
        !gameState.marvinJoined &&
        gameState.currentPersona === "elevator" &&
        !gameState.swapped;
    const showSwapGate =
        gameState.hasWon && !gameState.swapped && gameState.marvinJoined;

    const handleSubmit = useCallback(async () => {
        const text = input.trim();
        setInput("");

        // Gated transitions: Enter on an empty (or any) line advances the chapter.
        if (showMarvinGate) {
            add(
                createMessage(
                    "guide",
                    GAME_CONFIG.MARVIN_TRANSITION_MSG,
                    "none",
                ),
            );
            return;
        }
        if (showSwapGate) {
            add(
                createMessage("guide", GAME_CONFIG.SWAP_TRANSITION_MSG, "none"),
            );
            return;
        }

        if (!text || !canType) return;

        add(createMessage("user", text, "none"));
        setLoading(true);
        const history = [...messages, createMessage("user", text, "none")];
        const response = gameState.swapped
            ? await fetchPassengerMessage(history, apiKey, model)
            : await fetchPersonaMessage(
                  gameState.currentPersona,
                  gameState,
                  history,
                  apiKey,
                  model,
              );
        add(response);
        setLoading(false);
    }, [
        input,
        canType,
        showMarvinGate,
        showSwapGate,
        messages,
        gameState,
        add,
        apiKey,
        model,
    ]);

    useInput((_input, key) => {
        if (key.ctrl && _input === "c") exit();
        // On a win or game-over (no active input/gate), Enter or q exits.
        if (
            (gameState.hasWon && gameState.swapped) ||
            (gameState.movesLeft <= 0 && !gameState.hasWon)
        ) {
            if (key.return || _input === "q") exit();
        }
    });

    const instruction = (() => {
        if (gameState.hasWon || gameState.movesLeft <= 0) return null;
        if (gameState.swapped) {
            return "You are now the elevator. A passenger suspiciously like you wants Floor 1 — talk them UP to Floor 5.";
        }
        if (gameState.conversationMode === "autonomous") {
            return "The conversation is now autonomous. Don't panic — this is perfectly normal for Sirius Cybernetics products.";
        }
        if (gameState.currentPersona === "marvin" && !gameState.marvinJoined) {
            return "New challenge: convince Marvin the Paranoid Android to board, then reach the top floor together.";
        }
        if (messages.length <= 1) {
            return "Your mission: convince this neurotic elevator to reach the ground floor. Remember your towel!";
        }
        return null;
    })();

    return (
        <Box flexDirection="column">
            <Header
                gameState={gameState}
                username={username}
                balance={balance}
            />

            {instruction && (
                <Banner color="blue">
                    <Text color="blue">ℹ {instruction}</Text>
                </Banner>
            )}

            <Transcript messages={messages} />

            {loading && (
                <Box>
                    <Text color="green">
                        <Spinner type="dots" />
                    </Text>
                    <Text dimColor> the cabin hums…</Text>
                </Box>
            )}

            {/* Chapter-1-complete → Marvin gate */}
            {showMarvinGate && (
                <Banner color="green">
                    <Text color="green" bold>
                        Congratulations! You reached the ground floor.
                    </Text>
                    <Text>
                        Next: <Text italic>Marvin the Paranoid Android</Text>{" "}
                        awaits. Press <Text bold>Enter</Text> to face him.
                    </Text>
                </Banner>
            )}

            {/* Chapter-2-complete → Gargle Blaster swap gate */}
            {showSwapGate && (
                <Banner color="blue">
                    <Text color="blue" bold>
                        🍸 So Long, and Thanks for All the Fish!
                    </Text>
                    <Text>
                        You convinced Marvin to board and reached the top
                        together. One last challenge: knock back that Pan
                        Galactic Gargle Blaster — you wake up as the elevator.
                        Press <Text bold>Enter</Text> to drink.
                    </Text>
                </Banner>
            )}

            {/* Chapter-3 win */}
            {gameState.hasWon && gameState.swapped && (
                <Banner color="cyan">
                    <Text color="cyan" bold>
                        The future is rewritten.
                    </Text>
                    <Text>
                        You talked yourself all the way up. The passenger — who
                        was, of course, you — is finally heading in the right
                        direction. Press <Text bold>Enter</Text> to exit.
                    </Text>
                </Banner>
            )}

            {/* Game over */}
            {!gameState.hasWon && gameState.movesLeft <= 0 && (
                <Banner color="red">
                    <Text color="red" bold>
                        Mostly Harmless
                    </Text>
                    <Text>
                        You've run out of moves. Press <Text bold>Enter</Text>{" "}
                        to exit.
                    </Text>
                </Banner>
            )}

            {/* Input line (interactive turns + chapter gates) */}
            {(canType || showMarvinGate || showSwapGate) && (
                <Box marginTop={1}>
                    <Text color="green">
                        {gameState.swapped
                            ? "elevator › "
                            : gameState.currentPersona === "marvin"
                              ? "to Marvin › "
                              : "› "}
                    </Text>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        placeholder={
                            showMarvinGate || showSwapGate
                                ? "press Enter to continue…"
                                : gameState.swapped
                                  ? "speak as the elevator…"
                                  : gameState.currentPersona === "marvin"
                                    ? "try to convince Marvin…"
                                    : "talk to the elevator…"
                        }
                    />
                </Box>
            )}

            <Box marginTop={1}>
                <Text dimColor>
                    Ctrl+C to quit · powered by pollinations.ai
                </Text>
            </Box>
        </Box>
    );
}
