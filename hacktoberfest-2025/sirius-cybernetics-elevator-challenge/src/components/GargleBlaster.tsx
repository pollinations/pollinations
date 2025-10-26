import { useEffect, useState } from 'react';

const BUBBLE_CHARS = ['∘', '○', '◦', '●', '⚬', '*', '⋆', '✦', '✧'];
const NUM_BUBBLES = 6;

type Bubble = {
  char: string;
  x: number;
  y: number;
  speed: number;
  phase: number;
};

const GLASS_ASCII = `
     🌌 PAN GALACTIC GARGLE BLASTER 🌌

            .---------------.
           /               \\
          |    .------.     |
          |   |      |      |     *sparkle*
          |   |      |      |       ✨
          |   |      |      |   
          |   |      |      |     
          |   |      |      |   
     jgs  |   |      |      |     
          |   |      |      |   
          |   '------'      |     
          |                |
          '---------------'
            '--______--'    

      "Like having your brains smashed out
       by a slice of lemon wrapped round
          a large gold brick."
`;

export const GargleBlaster = () => {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => 
    Array.from({ length: NUM_BUBBLES }, () => ({
      char: BUBBLE_CHARS[Math.floor(Math.random() * BUBBLE_CHARS.length)],
      x: Math.floor(Math.random() * 14) + 8,  // Wider range for x position
      y: 12,  // Start lower in the glass
      speed: Math.random() * 0.3 + 0.1,
      phase: Math.random() * Math.PI * 2,
    }))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setBubbles(prev => prev.map(bubble => {
        const newY = bubble.y - bubble.speed;
        
        if (newY < 4) {  // Stop higher in the glass
          return {
            char: BUBBLE_CHARS[Math.floor(Math.random() * BUBBLE_CHARS.length)],
            x: Math.floor(Math.random() * 14) + 8,
            y: 12,
            speed: Math.random() * 0.3 + 0.1,
            phase: Math.random() * Math.PI * 2,
          };
        }

        const wobble = Math.sin(bubble.phase + Date.now() / 1000) * 0.3;
        
        return {
          ...bubble,
          y: newY,
          x: bubble.x + wobble,
          char: BUBBLE_CHARS[Math.floor(Math.random() * BUBBLE_CHARS.length)],
        };
      }));
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const renderFrame = () => {
    const lines = GLASS_ASCII.split('\n');
    
    bubbles.forEach(bubble => {
      const lineIndex = Math.floor(bubble.y);
      const xPos = Math.floor(bubble.x);
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (xPos >= 0 && xPos < line.length) {
          const newLine = line.slice(0, xPos) + bubble.char + line.slice(xPos + 1);
          lines[lineIndex] = newLine;
        }
      }
    });

    return lines.join('\n');
  };

  return (
    <div className="flex flex-col items-center justify-center w-full my-8">
      <pre className="text-yellow-400 whitespace-pre font-mono text-sm inline-block mx-auto">
        {renderFrame()}
      </pre>
    </div>
  );
};
