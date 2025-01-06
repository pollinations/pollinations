import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { usePollinationsImage } from "@pollinations/react";
import useRandomSeed from "../hooks/useRandomSeed";

const topBandPrompt = encodeURIComponent(
    "A horizontal centered row on an almost white (#FAFAFA) background featuring 4-7 evenly spaced circular icons inspired by Egyptian hieroglyphs. The design should be elegant and minimal, incorporating elements that evoke a sense of mystery and ancient elegance, with subtle, refined lines in black and white."
);

const TopBand = () => {

    const seed = useRandomSeed();
    const backgroundImage = usePollinationsImage(topBandPrompt, { width: 500, height: 100, nologo: true, seed });

    return <TopBandStyle backgroundImage={backgroundImage} />;
};

const TopBandStyle = styled.div`
  width: 100%;
  height: 83px;
  background-image: url("${(props) => props.backgroundImage}");
  background-repeat: repeat-x;
  background-size: auto 100%;
`;

export default TopBand;