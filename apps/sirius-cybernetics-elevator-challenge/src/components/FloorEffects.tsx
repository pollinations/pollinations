interface FloorEffectsProps {
    currentFloor: number;
}

const FLOOR_EFFECTS: Record<number, JSX.Element[]> = {
    1: [
        <div
            key="tea"
            className="effect tea-steam"
            style={{ left: "4.5%", top: "48%" }}
        />,
        <div
            key="schedule"
            className="effect monitor-pulse-soft"
            style={{ left: "15%", top: "25%" }}
        />,
        <div
            key="starL1"
            className="effect star-twinkle"
            style={{ left: "10%", top: "15%" }}
        />,
        <div
            key="gate1"
            className="effect gate-arrow-1"
            style={{ left: "92.5%", top: "30.5%" }}
        />,
        <div
            key="gate2"
            className="effect gate-arrow-2"
            style={{ left: "92.5%", top: "38.5%" }}
        />,
        <div
            key="starR1"
            className="effect star-twinkle"
            style={{ left: "85%", top: "20%" }}
        />,
        <div
            key="starR2"
            className="effect star-twinkle"
            style={{ left: "90%", top: "60%" }}
        />,
    ],
    2: [
        <div
            key="monitor"
            className="effect monitor-glow-red"
            style={{ left: "20.5%", top: "24%" }}
        />,
        <div
            key="tools"
            className="effect star-twinkle"
            style={{ left: "10%", top: "40%" }}
        />,
        <div
            key="sparksL"
            className="effect star-twinkle"
            style={{ left: "5%", top: "70%", backgroundColor: "#fbbf24" }}
        />,
        <div
            key="eyes"
            className="effect robot-eyes"
            style={{ left: "80.2%", top: "38.2%" }}
        />,
        <div
            key="oil"
            className="effect oil-drip"
            style={{ left: "74.2%", top: "63.5%" }}
        />,
        <div
            key="lamp"
            className="effect monitor-pulse-soft lamp-warm"
            style={{ left: "85%", top: "15%" }}
        />,
    ],
    3: [
        <div
            key="wrenches"
            className="effect monitor-pulse-soft"
            style={{ left: "15%", top: "35%" }}
        />,
        <div
            key="server"
            className="effect server-lights"
            style={{ left: "7.5%", top: "70%" }}
        />,
        <div
            key="wires"
            className="effect star-twinkle"
            style={{ left: "12%", top: "80%", animationDelay: "1s" }}
        />,
        <div
            key="starR1"
            className="effect star-twinkle"
            style={{ left: "85%", top: "35%" }}
        />,
        <div
            key="starR2"
            className="effect star-twinkle"
            style={{ left: "94%", top: "42%", animationDelay: "1.2s" }}
        />,
        <div
            key="starR3"
            className="effect star-twinkle"
            style={{ left: "88%", top: "22%", animationDelay: "2.1s" }}
        />,
        <div
            key="day42"
            className="effect error-glow"
            style={{ left: "92%", top: "65%" }}
        />,
    ],
    4: [
        <div
            key="battery"
            className="effect charging-battery"
            style={{ left: "16.8%", top: "44.8%" }}
        />,
        <div
            key="charge-glow"
            className="effect charge-glow"
            style={{ left: "12%", top: "35%" }}
        />,
        <div
            key="starL1"
            className="effect star-twinkle"
            style={{ left: "24%", top: "22%" }}
        />,
        <div
            key="starL2"
            className="effect star-twinkle"
            style={{ left: "28%", top: "35%", animationDelay: "1.5s" }}
        />,
        <div
            key="vending-glow"
            className="effect vending-glow"
            style={{ left: "75%", top: "40%" }}
        />,
        <div
            key="menu-pulse"
            className="effect monitor-pulse-soft"
            style={{ left: "88%", top: "25%" }}
        />,
    ],
    5: [
        <div
            key="neon"
            className="effect dont-panic-neon"
            style={{ left: "15%", top: "48%" }}
        />,
        <div
            key="starL1"
            className="effect star-twinkle"
            style={{ left: "15%", top: "15%" }}
        />,
        <div
            key="starL2"
            className="effect star-twinkle"
            style={{ left: "25%", top: "20%" }}
        />,
        <div
            key="towel-float"
            className="effect towel"
            style={{ left: "10%", top: "75%" }}
        />,
        <div
            key="starR1"
            className="effect star-twinkle"
            style={{ left: "82%", top: "55%", animationDelay: "2.4s" }}
        />,
        <div
            key="starR2"
            className="effect star-twinkle"
            style={{ left: "88%", top: "28%", animationDelay: "3.1s" }}
        />,
        <div
            key="starR3"
            className="effect star-twinkle"
            style={{ left: "75%", top: "15%", animationDelay: "1.1s" }}
        />,
        <div
            key="console-pulse"
            className="effect server-lights"
            style={{ left: "85%", top: "80%" }}
        />,
    ],
};

const FloorStyles = () => (
    <style>{`
    .floor-effects-container {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      z-index: 10;
      pointer-events: none;
    }

    .effect {
      position: absolute;
      transform: translate(-50%, -50%);
      pointer-events: none;
      will-change: transform, opacity;
    }

    @keyframes star-twinkle {
      0%, 100% { opacity: 0.1; transform: translate(-50%, -50%) scale(0.6); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
    }

    .effect.star-twinkle {
      width: 4px;
      height: 4px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.9);
      animation: star-twinkle 4s ease-in-out infinite;
    }

    @keyframes soft-pulse {
      0%, 100% { opacity: 0.2; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.05); }
    }

    .effect.monitor-pulse-soft {
      width: 15vw;
      height: 15vh;
      background: radial-gradient(circle, rgba(147, 197, 253, 0.3) 0%, transparent 70%);
      animation: soft-pulse 4s ease-in-out infinite;
    }

    .effect.monitor-pulse-soft.lamp-warm {
      background: radial-gradient(circle, rgba(254,249,195,0.2) 0%, transparent 70%);
    }

    .effect.monitor-glow-red {
      width: 10vw;
      height: 12vh;
      background: radial-gradient(ellipse at center, rgba(220, 38, 38, 0.6) 0%, transparent 75%);
      animation: soft-pulse 3s ease-in-out infinite;
    }

    @keyframes gate-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.1; }
    }

    .effect.gate-arrow-1, .effect.gate-arrow-2 {
      width: 2vw;
      height: 3vh;
      background: radial-gradient(circle at center, rgba(167, 243, 208, 0.9) 0%, transparent 70%);
      animation: gate-blink 2s steps(1) infinite;
    }

    .effect.gate-arrow-2 {
      animation-delay: 1s;
    }

    @keyframes steam-rise {
      0% { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
      20% { opacity: 0.4; }
      100% { opacity: 0; transform: translate(-50%, -8vh) scale(1.8); }
    }

    .effect.tea-steam {
      width: 3vw;
      height: 8vh;
      background: radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, transparent 70%);
      filter: blur(6px);
      animation: steam-rise 4s ease-out infinite;
    }

    .effect.robot-eyes {
      width: 2vw;
      height: 2vh;
      background: radial-gradient(ellipse at center, rgba(253, 224, 71, 0.9) 0%, transparent 70%);
      animation: gate-blink 0.5s steps(1) infinite;
    }

    @keyframes oil-drip-fall {
      0% { opacity: 0; transform: translate(-50%, 0) scaleY(0.5); }
      5% { opacity: 1; transform: translate(-50%, 2px) scaleY(1); }
      90% { opacity: 1; transform: translate(-50%, 18vh) scaleY(1.2); }
      100% { opacity: 0; transform: translate(-50%, 20vh) scaleY(0.2); }
    }

    .effect.oil-drip {
      width: 4px;
      height: 12px;
      background: linear-gradient(to bottom, #3b2b1a, #1a120b);
      border-radius: 2px;
      animation: oil-drip-fall 2.5s ease-in infinite;
    }

    .effect.server-lights {
      width: 8vw;
      height: 15vh;
      background: radial-gradient(circle at 30% 30%, rgba(52, 211, 153, 0.7) 0%, transparent 30%),
                  radial-gradient(circle at 70% 60%, rgba(248, 113, 113, 0.7) 0%, transparent 30%);
      animation: soft-pulse 2s infinite alternate;
    }

    .effect.vending-glow {
      width: 18vw;
      height: 40vh;
      background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.25) 0%, transparent 70%);
      animation: soft-pulse 5s ease-in-out infinite;
    }

    .effect.charging-battery {
      width: 1.5vw;
      height: 1.5vw;
      background: #ef4444;
      box-shadow: 0 0 10px 2px rgba(239, 68, 68, 0.8);
      border-radius: 2px;
      animation: gate-blink 1.5s steps(1) infinite;
    }

    .effect.error-glow {
      width: 8vw;
      height: 10vh;
      background: radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, transparent 70%);
      animation: soft-pulse 2s ease-in-out infinite;
    }

    .effect.charge-glow {
      width: 10vw;
      height: 12vh;
      background: radial-gradient(circle, rgba(52, 211, 153, 0.2) 0%, transparent 70%);
      animation: soft-pulse 3s ease-in-out infinite;
    }

    @keyframes zero-g-float {
      0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
      33% { transform: translate(-40%, -60%) rotate(5deg); }
      66% { transform: translate(-60%, -45%) rotate(-5deg); }
    }

    .effect.towel {
      width: 8vw;
      height: 8vw;
      background: radial-gradient(circle at center, rgba(253, 224, 71, 0.15) 0%, transparent 60%);
      animation: zero-g-float 12s ease-in-out infinite;
    }

    .effect.dont-panic-neon {
      width: 15vw;
      height: 18vh;
      background: radial-gradient(ellipse at center, rgba(236, 72, 153, 0.4) 0%, transparent 75%);
      animation: soft-pulse 0.8s infinite alternate;
    }

    @media (prefers-reduced-motion: reduce) {
      .effect {
        animation: none !important;
      }
    }
  `}</style>
);

export const FloorEffects = ({ currentFloor }: FloorEffectsProps) => {
    return (
        <>
            <FloorStyles />
            <div className="floor-effects-container">
                {FLOOR_EFFECTS[currentFloor] || null}
            </div>
        </>
    );
};

export default FloorEffects;
