import React from "react";
import styled from "@emotion/styled";
import { ReactSVG } from "react-svg";

const StyledIcon = styled(ReactSVG)`
  background: transparent;
  svg {
    fill: ${(props) => props.fillcolor || "currentColor"};
    width: ${(props) => props.width || "auto"};
    height: ${(props) => props.height || "auto"};
    margin-right: ${(props) => props.marginright || "0px"};
  }
`;

export const Icon = ({ src, fillcolor, width, height, marginright, ...rest }) => {
  return (
    <StyledIcon
      src={src}
      fillcolor={fillcolor}
      width={width}
      height={height}
      marginright={marginright}
      {...rest}
    />
  );
};
