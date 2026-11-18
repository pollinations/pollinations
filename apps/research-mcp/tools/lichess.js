import { z } from "zod";

// Lichess puzzle ids are short alphanumeric strings (e.g. "kxyRP", "00008").
const puzzleId = z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, "Use a Lichess puzzle id, e.g. kxyRP.")
    .describe("Lichess puzzle id, e.g. kxyRP. Omit for today's daily puzzle.");

function projectPuzzle(data) {
    const { game, puzzle } = data;
    const sideToMove = puzzle.fen.split(" ")[1] === "w" ? "white" : "black";
    const player = (color) => game.players.find((p) => p.color === color);
    const white = player("white");
    const black = player("black");
    return {
        puzzle_id: puzzle.id,
        rating: puzzle.rating,
        plays: puzzle.plays,
        solution: puzzle.solution,
        themes: puzzle.themes,
        fen: puzzle.fen,
        side_to_move: sideToMove,
        last_move: puzzle.lastMove,
        initial_ply: puzzle.initialPly,
        game: {
            id: game.id,
            pgn: game.pgn,
            clock: game.clock,
            rated: game.rated,
            perf: game.perf?.name,
            white: white ? { name: white.name, rating: white.rating } : null,
            black: black ? { name: black.name, rating: black.rating } : null,
        },
        url: `https://lichess.org/training/${puzzle.id}`,
    };
}

export const lichessTools = [
    [
        "lichess_puzzle",
        "Get the Lichess daily chess puzzle, or a specific puzzle by id. Returns the position (FEN), solution moves, rating, themes and the game it came from.",
        { id: puzzleId.optional() },
        async ({ id }, fetchJson) => {
            if (id !== undefined && id.trim() === "")
                throw new Error("Use a Lichess puzzle id, e.g. kxyRP.");
            const trimmed = id?.trim();
            if (trimmed && !/^[A-Za-z0-9]+$/.test(trimmed))
                throw new Error("Use a Lichess puzzle id, e.g. kxyRP.");
            const url = trimmed
                ? `https://lichess.org/api/puzzle/${trimmed}`
                : "https://lichess.org/api/puzzle/daily";
            return projectPuzzle(await fetchJson(url));
        },
    ],
];
