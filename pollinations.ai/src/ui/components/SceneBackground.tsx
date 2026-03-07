const POLLEN_COUNT = 10;

function PollenParticles() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: POLLEN_COUNT }, (_, i) => (
                <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static particle list
                    key={i}
                    className={`pollen-particle ${i % 3 === 0 ? "pollen-blue" : ""}`}
                    style={{
                        left: `${8 + ((i * 73) % 84)}%`,
                        animationDuration: `${8 + ((i * 3.7) % 6)}s`,
                        animationDelay: `${(i * 2.3) % 8}s`,
                    }}
                />
            ))}
        </div>
    );
}

export function SceneBackground() {
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
}
