import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { usePollinationsText } from "@pollinations/react";

const Container = styled.div`
  width: ${({ width }) => width}px;
  height: ${({ height }) => height}px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const SvgArtGenerator = ({ width = 600, height = 300, style, prompt = "Create a minimalist, abstract SVG artwork with simple geometric shapes and subtle animations" }) => {
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeed((seed) => (seed + 1) % 30);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const svgArt = usePollinationsText(
    `${prompt}. Make it exactly ${width}x${height} pixels. 
     Ensure it's valid SVG markup with subtle animations using <animate> tags.
     Keep it minimal and abstract.`,
    { seed }
  );

  return (
    <Container width={width} height={height} style={style}>
      <div dangerouslySetInnerHTML={{ __html: svgArt }} />
    </Container>
  );
};

export default SvgArtGenerator;
