import { DotLottieReact } from "@lottiefiles/dotlottie-react";

interface FloorEffectsLottieProps {
    currentFloor: number;
}

// Each Lottie includes background + animations
const FLOOR_LOTTIES: Record<number, string> = {
    1: "/floor1.lottie",
    2: "/floor2.lottie",
    3: "/floor3.lottie",
    4: "/floor4.lottie",
    5: "/floor5.lottie",
};

export const FloorEffectsLottie = ({
    currentFloor,
}: FloorEffectsLottieProps) => {
    const lottiePath = FLOOR_LOTTIES[currentFloor];

    if (!lottiePath) {
        return null;
    }

    return (
        <div className="floor-lottie-container">
            <DotLottieReact
                src={lottiePath}
                autoplay
                loop
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                }}
            />
        </div>
    );
};

export default FloorEffectsLottie;
