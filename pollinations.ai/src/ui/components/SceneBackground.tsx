import { memo } from "react";

const POLLEN_COUNT = 10;

// Pre-compute particle styles as a constant — avoids creating new objects each render
const PARTICLE_STYLES = Array.from({ length: POLLEN_COUNT }, (_, i) => ({
    left: `${8 + ((i * 73) % 84)}%`,
    animationDuration: `${8 + ((i * 3.7) % 6)}s`,
    animationDelay: `${(i * 2.3) % 8}s`,
}));

const PARTICLE_CLASSES = Array.from(
    { length: POLLEN_COUNT },
    (_, i) => `pollen-particle${i % 3 === 0 ? " pollen-blue" : ""}`,
);

const PollenParticles = memo(function PollenParticles() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {PARTICLE_STYLES.map((style, i) => (
                <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static particle list
                    key={i}
                    className={PARTICLE_CLASSES[i]}
                    style={style}
                />
            ))}
        </div>
    );
});

export const SceneBackground = memo(function SceneBackground() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none">
            {/* Layer 1: Subtle fallback gradient */}
            <div className="absolute inset-0 bg-gradient-scene" />

            {/* Layer 2: Sky scene — top, masked fade */}
            <div className="scene-sky" />

            {/* Layer 3: Ground scene — bottom, masked fade */}
            <div className="scene-ground" />

            {/* Layer 4: Floating pollen particles */}
            <PollenParticles />
        </div>
    );
});
