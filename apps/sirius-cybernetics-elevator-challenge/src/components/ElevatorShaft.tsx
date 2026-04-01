import { GAME_CONFIG } from "@/types";

interface ElevatorShaftProps {
    currentFloor: number;
    isMarvinMode: boolean;
    hasMarvinJoined: boolean;
}

const FLOOR_LABELS: Record<number, { label: string; tag?: string }> = {
    5: { label: "F5", tag: "Party!" },
    4: { label: "F4" },
    3: { label: "F3", tag: "Start" },
    2: { label: "F2" },
    1: { label: "F1", tag: "Goal \u2193" },
};

export function ElevatorShaft({
    currentFloor,
    isMarvinMode,
    hasMarvinJoined,
}: ElevatorShaftProps) {
    const floors = Array.from({ length: GAME_CONFIG.FLOORS }, (_, i) => GAME_CONFIG.FLOORS - i);

    return (
        <div className="flex items-center justify-center gap-3 py-1">
            {/* Floor indicator text */}
            <div className="text-cyan-400 text-xs font-bold tracking-wider whitespace-nowrap">
                FLOOR {currentFloor}
            </div>

            {/* Shaft visualization */}
            <div className="flex flex-col items-center gap-0.5">
                {floors.map((floor) => {
                    const isCurrentFloor = floor === currentFloor;
                    const isGoal = floor === 1;
                    const isTop = floor === GAME_CONFIG.FLOORS;
                    const floorInfo = FLOOR_LABELS[floor];

                    return (
                        <div key={floor} className="flex items-center gap-1.5">
                            {/* Left label */}
                            <span className={`text-[10px] w-6 text-right font-mono ${
                                isCurrentFloor ? "text-green-400 font-bold" : "text-green-400/30"
                            }`}>
                                {floorInfo?.label}
                            </span>

                            {/* Shaft cell */}
                            <div className={`w-10 h-4 border font-mono text-[9px] flex items-center justify-center transition-all ${
                                isCurrentFloor
                                    ? "border-green-400 bg-green-400/20 text-green-400"
                                    : "border-green-400/20 bg-gray-800/50 text-green-400/20"
                            }`}>
                                {isCurrentFloor && (
                                    isMarvinMode
                                        ? hasMarvinJoined ? "MA\u2191" : "\u25A0\u25A0"
                                        : "\u25A0\u25A0"
                                )}
                                {!isCurrentFloor && "\u00B7\u00B7"}
                            </div>

                            {/* Right tag */}
                            <span className={`text-[9px] w-10 font-mono ${
                                isGoal
                                    ? "text-yellow-400"
                                    : isTop
                                        ? "text-red-400/60"
                                        : "text-green-400/20"
                            }`}>
                                {floorInfo?.tag ?? ""}
                            </span>

                            {/* Marvin outside elevator */}
                            {isCurrentFloor && isMarvinMode && !hasMarvinJoined && (
                                <span className="text-[10px] text-pink-400 ml-1">MA</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
