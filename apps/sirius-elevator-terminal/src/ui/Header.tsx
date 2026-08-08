// Top status bar: title, a 5-floor gauge, move counter, and (chapter 3) the
// passenger's desired floor. Pure presentational component.

import { Box, Text } from "ink";
import { GAME_CONFIG, type GameState } from "../types.js";

type HeaderProps = {
    gameState: GameState;
    username: string | null;
    balance: number | null;
};

// A vertical-ish gauge rendered horizontally: ▓ for filled floors, ░ for empty.
function floorGauge(floor: number): string {
    const cells: string[] = [];
    for (let f = 1; f <= GAME_CONFIG.FLOORS; f++) {
        cells.push(f <= floor ? "▓" : "░");
    }
    return cells.join("");
}

export function Header({ gameState, username, balance }: HeaderProps) {
    const { swapped, currentFloor, desiredFloor, movesLeft } = gameState;
    const gaugeFloor = swapped ? desiredFloor : currentFloor;
    const gaugeLabel = swapped ? "Wants" : "Floor";

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="green"
            paddingX={1}
        >
            <Box justifyContent="space-between">
                <Text bold color="green">
                    🛗 Sirius Cybernetics Elevator Challenge
                </Text>
                <Text dimColor>
                    {username ? `@${username}` : "guest"}
                    {balance !== null ? ` · ${balance.toFixed(2)} pollen` : ""}
                </Text>
            </Box>
            <Box justifyContent="space-between">
                <Text>
                    <Text color="cyan">{gaugeLabel}: </Text>
                    <Text color={swapped ? "cyan" : "green"}>
                        {floorGauge(gaugeFloor)}
                    </Text>
                    <Text>
                        {" "}
                        {gaugeFloor}/{GAME_CONFIG.FLOORS}
                    </Text>
                </Text>
                <Text dimColor>moves left: {Math.max(0, movesLeft)}</Text>
            </Box>
        </Box>
    );
}
