import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { usePollinationsImage } from "@pollinations/react";
import useRandomSeed from "../hooks/useRandomSeed";
import { topBandPrompt } from "../utils/stylePrompt";


const TopBand = () => {
  const seed = useRandomSeed();
  const backgroundImage = usePollinationsImage(topBandPrompt, {
    width: 1000,
    height: 100,
    nologo: true,
    seed,
  });

  return <TopBandStyle backgroundImage={backgroundImage} />;
};

const TopBandStyle = styled.div`
  width: 100%;
  height: 83px;
  background-image: url("${(props) => props.backgroundImage}");
  background-repeat: repeat-x;
  background-size: auto 100%;
  background-color: black;
`;

export default TopBand;