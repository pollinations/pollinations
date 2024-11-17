import React, { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { usePollinationsText } from '@pollinations/react';

const AsciiContainer = styled.pre`
    font-family: monospace;
    width: ${({ width }) => width}px;
    height: ${({ height }) => height}px;
    overflow: hidden;
`;

const AsciiArtGenerator = ({ width = 600, height = 300, style }) => {
    const [seed, setSeed] = useState(1);

    // Calculate character dimensions based on pixel dimensions
    const charWidth = Math.floor(width / 8); // Default to 30 characters wide if width is not provided
    const charHeight = Math.floor(height / 16); // Default to 10 characters tall if height is not provided

    const prompt = `Unicode/ Ascii Art depicting digital pollination. ${charWidth} width x ${charHeight} height characters. Use fun unicode stuff but keep a lot of space empty. Return only the characters, no other text or quotes.`;

    useEffect(() => {
        const interval = setInterval(() => {
            setSeed(seed => (seed + 1) % 30);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const asciiArt = usePollinationsText(prompt, { seed });

    return <AsciiContainer width={width} height={height} style={style}>
        {asciiArt}
    </AsciiContainer>;
}

export default AsciiArtGenerator;