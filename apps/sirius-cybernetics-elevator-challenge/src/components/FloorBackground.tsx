import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import "./FloorBackground.css";
import type { AnimationMode } from "@/types";

interface FloorBackgroundProps {
    currentFloor: number;
    animationMode?: AnimationMode;
}

// Map floors to their respective assets
const FLOOR_ASSETS: Record<number, { lottie: string; png: string }> = {
    1: { lottie: "./floor1.lottie", png: "./floor1.png" },
    2: { lottie: "./floor2.lottie", png: "./floor2.png" },
    3: { lottie: "./floor3.lottie", png: "./floor3.png" },
    4: { lottie: "./floor4.lottie", png: "./floor4.png" },
    5: { lottie: "./floor5.lottie", png: "./floor5.png" },
};

export function FloorBackground({
    currentFloor,
    animationMode = "lottie",
}: FloorBackgroundProps) {
    const assets = FLOOR_ASSETS[currentFloor];

    if (!assets) {
        return null;
    }

    return (
        <div className="floor-background">
            {animationMode === "lottie" && (
                <div className="floor-lottie-wrapper">
                    <DotLottieReact
                        src={assets.lottie}
                        autoplay
                        loop
                        style={{
                            width: "1280px",
                            height: "720px",
                        }}
                    />
                </div>
            )}

            {animationMode === "png" && (
                <div className="floor-png-wrapper">
                    <img
                        src={assets.png}
                        alt={`Floor ${currentFloor}`}
                        className="floor-png-image"
                    />
                </div>
            )}

            <div className="floor-vignette" />
        </div>
    );
}

export default FloorBackground;
