import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { usePollinationsText } from "@pollinations/react";
import { ASCII_ART_PROMPT } from "../config/copywrite.js";

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

    const prompt = ASCII_ART_PROMPT(charWidth, charHeight);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeed((seed) => (seed + 1) % 30);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const asciiArt = usePollinationsText(prompt, { seed });

    return (
        <AsciiContainer width={width} height={height} style={style}>
            {asciiArt}
        </AsciiContainer>
    );
};

export default AsciiArtGenerator;
