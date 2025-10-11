import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { usePollinationsText } from "@pollinations/react";
import { Colors } from "../config/global";
const Container = styled.div`
  width: ${({ width }) => width}px;
  height: ${({ height }) => height}px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  position: absolute;
`;

const SvgArtGenerator = ({
    width = "100%",
    height = "100%",
    style,
    prompt = "Create a minimalist, abstract SVG artwork with simple geometric curved lines and ping pong balls slowly interacting with them. Make it minmal and mesmerizing, add subtle animations. Make sure the background is transparent. Use the colors yellow only.",
}) => {
    const [seed, setSeed] = useState(1);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeed((seed) => (seed + 1) % 5);
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const svgArt = usePollinationsText(
        `${prompt}. Make it exactly ${width}x${height} pixels. 
     Ensure it's valid SVG markup with subtle animations using <animate> tags.
     Keep it minimal and abstract.`,
        { seed },
    );

    return (
        <Container width={width} height={height} style={style}>
            <div dangerouslySetInnerHTML={{ __html: svgArt }} />
        </Container>
    );
};

export default SvgArtGenerator;
