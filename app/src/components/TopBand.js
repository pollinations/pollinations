import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { usePollinationsImage } from "@pollinations/react";
import useRandomSeed from "../hooks/useRandomSeed";

const topBandPrompt = encodeURIComponent(
    "One horizontal centered row on almost white (#FAFAFA) background with 4-7 evenly spaced larger circular icons such as insects, flowers, pollen, bees, butterflies, (be creative with arrows) in black and white."
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