import { Film, Image } from "lucide-react";
import type { AnimationMode } from "@/types";

interface AnimationToggleProps {
    currentMode: AnimationMode;
    onChange: (mode: AnimationMode) => void;
}

export function AnimationToggle({
    currentMode,
    onChange,
}: AnimationToggleProps) {
    const isAnimated = currentMode === "lottie";

    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-cyan-300/70 uppercase tracking-wider">
                Background Animations
            </span>
            <button
                type="button"
                onClick={() => onChange(isAnimated ? "png" : "lottie")}
                className={`relative h-7 w-14 rounded-full transition-colors duration-200 ${
                    isAnimated ? "bg-cyan-600" : "bg-gray-700"
                }`}
                aria-label={
                    isAnimated ? "Turn off animations" : "Turn on animations"
                }
            >
                <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 flex items-center justify-center ${
                        isAnimated ? "translate-x-7" : "translate-x-0"
                    }`}
                >
                    {isAnimated ? (
                        <Film className="w-3.5 h-3.5 text-cyan-600" />
                    ) : (
                        <Image className="w-3.5 h-3.5 text-gray-600" />
                    )}
                </span>
            </button>
            <span
                className={`text-xs font-medium ${isAnimated ? "text-cyan-400" : "text-gray-400"}`}
            >
                {isAnimated ? "ON" : "OFF"}
            </span>
        </div>
    );
}

export default AnimationToggle;
