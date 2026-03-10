interface AuthGateProps {
    onLogin: () => void;
}

/**
 * Full-screen blocking gate shown when user has not connected their Pollinations account.
 * Immersive fantasy-themed design.
 */
export function AuthGate({ onLogin }: AuthGateProps) {
    return (
        <div
            className="min-h-screen text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden"
            style={{
                background:
                    "radial-gradient(ellipse at center bottom, #3a2817 0%, #1a0e06 60%, #0d0704 100%)",
            }}
        >
            {/* Decorative ambient particles */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
                {[...Array(20)].map((_, i) => (
                    <span
                        key={i}
                        className="absolute rounded-full opacity-20"
                        style={{
                            width: `${2 + Math.random() * 4}px`,
                            height: `${2 + Math.random() * 4}px`,
                            background: "#d4a76a",
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                            animationDelay: `${Math.random() * 3}s`,
                        }}
                    />
                ))}
            </div>

            {/* Glow ring behind card */}
            <div
                className="absolute w-[500px] h-[500px] rounded-full opacity-15 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(circle, #d4a76a 0%, transparent 70%)",
                }}
            />

            {/* Main card */}
            <div
                className="relative max-w-lg w-full rounded-2xl p-10 text-center"
                style={{
                    background:
                        "linear-gradient(170deg, rgba(58,40,23,0.95) 0%, rgba(44,30,18,0.98) 100%)",
                    border: "1px solid rgba(212,167,106,0.3)",
                    boxShadow:
                        "0 0 60px rgba(212,167,106,0.08), 0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,167,106,0.1)",
                }}
            >
                {/* Top ornament */}
                <div
                    className="mx-auto mb-6 flex items-center justify-center"
                    style={{
                        fontSize: "72px",
                        filter: "drop-shadow(0 0 20px rgba(212,167,106,0.4))",
                    }}
                >
                    ⚔️
                </div>

                {/* Title */}
                <h1
                    className="text-4xl font-bold mb-1 tracking-wide"
                    style={{
                        fontFamily: "Cinzel, serif",
                        color: "#d4a76a",
                        textShadow: "0 0 30px rgba(212,167,106,0.3)",
                    }}
                >
                    AI Dungeon Master
                </h1>

                {/* Subtitle rule */}
                <div className="flex items-center justify-center gap-3 my-4">
                    <span
                        className="block h-px flex-1"
                        style={{
                            background:
                                "linear-gradient(to right, transparent, rgba(212,167,106,0.4))",
                        }}
                    />
                    <span
                        className="text-xs uppercase tracking-[0.3em]"
                        style={{
                            color: "#b8a389",
                            fontFamily: "Cinzel, serif",
                        }}
                    >
                        Your tale awaits
                    </span>
                    <span
                        className="block h-px flex-1"
                        style={{
                            background:
                                "linear-gradient(to left, transparent, rgba(212,167,106,0.4))",
                        }}
                    />
                </div>

                {/* Description */}
                <p
                    className="mb-8 leading-relaxed text-base"
                    style={{
                        color: "#c4b097",
                        fontFamily: "EB Garamond, serif",
                    }}
                >
                    Embark on an AI-generated fantasy adventure with dynamic
                    storytelling, procedural combat, and unique artwork — all
                    powered by{" "}
                    <a
                        href="https://pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold transition-colors"
                        style={{ color: "#d4a76a" }}
                    >
                        Pollinations.ai
                    </a>
                    . Connect your free account to begin.
                </p>

                {/* Connect button */}
                <button
                    type="button"
                    onClick={onLogin}
                    className="w-full py-4 px-8 rounded-xl font-bold text-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.97]"
                    style={{
                        background:
                            "linear-gradient(135deg, #d4a76a 0%, #b8862e 100%)",
                        color: "#1a0e06",
                        fontFamily: "Cinzel, serif",
                        boxShadow:
                            "0 4px 20px rgba(212,167,106,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                        letterSpacing: "0.05em",
                    }}
                >
                    🐝 Connect with Pollinations
                </button>

                {/* Footer note */}
                <p className="text-xs mt-5" style={{ color: "#8a7a66" }}>
                    You'll be redirected to Pollinations to authorize, then
                    brought right back.
                </p>
            </div>

            {/* CSS keyframes for floating particles */}
            <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.15; }
          50% { transform: translateY(-18px) scale(1.3); opacity: 0.35; }
        }
      `}</style>
        </div>
    );
}
