import { type ElevatorAsciiProps, GAME_CONFIG } from "@/types";

export const ElevatorAscii = ({
    floor,
    showLegend = false,
    isMarvinMode = false,
    hasMarvinJoined = false,
}: ElevatorAsciiProps) => {
    const elevatorPosition = floor - 1;
    let floors = Array(GAME_CONFIG.FLOORS).fill("   |  |   ");

    if (isMarvinMode) {
        if (hasMarvinJoined) {
            // Marvin is in the elevator
            floors[elevatorPosition] = "  [|MA|]  ";
        } else {
            // Marvin is next to the elevator
            floors[elevatorPosition] = "MA[|##|]  ";
        }
    } else {
        floors[elevatorPosition] = "  [|##|]  ";
    }

    if (showLegend) {
        floors = floors.map(
            (_) => "                   |  |                   ",
        );
        floors[GAME_CONFIG.FLOORS - 1] =
            "                   |  |  <- Floor 5       ";
        floors[0] = "                   |  |  <- Floor 1 (Goal)";
        if (isMarvinMode) {
            floors[0] = "     Marvin -> MA  |  |  <- Floor 1       ";
        } else {
            floors[elevatorPosition] =
                "      Elevator -> [|##|]                  ";
        }
    }

    return floors.reverse().join("\n");
};
