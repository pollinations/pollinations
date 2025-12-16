import React from "react";
import styled from "@emotion/styled";
import { useTheme } from "@mui/material/styles";

const StyledSectionContainer = styled.div`
  width: 100%;
  display: flex;
  background-color: ${(props) =>
    props.backgroundConfig?.color
      ? props.backgroundConfig.color
      : "transparent"};
  background-image: ${(props) => {
    const { image, gradient } = props.backgroundConfig || {};
    if (!image) return "none";
    if (gradient) {
      return `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.9)), url(${image})`;
    }
    return `url(${image})`;
  }};
  background-size: cover;
  background-position: center center;
  background-repeat: repeat;
  margin: 0em auto;
  flex-direction: column;
  align-items: center;
  padding: ${(props) => props.padding || "1em"};
  ${({ theme }) => theme.breakpoints.down("md")} {
    padding: 1em 1em;
  }
  z-index: ${(props) => props.zIndex || "-1"};
`;

const StyledSectionSubContainer = styled.div`
  display: flex;
  background-color: ${(props) => props.backgroundColor || "transparent"};
  flex-direction: ${(props) => props.flexDirection || "column"};
  align-items: ${(props) => props.alignItems || "center"};
  margin: 0;
  width: 100%;
  max-width: 1000px;
  padding-bottom: ${(props) => props.paddingBottom || "1em"};
  padding-top: 2em;
  justify-content: center;
  z-index: ${(props) => props.zIndex || "1"};
`;

export const Section = ({ backgroundConfig, padding, zIndex, children, ...subContainerProps }) => {
  const theme = useTheme();

  return (
    <StyledSectionContainer
      backgroundConfig={backgroundConfig}
      padding={padding}
      zIndex={zIndex}
      theme={theme}
    >
      <StyledSectionSubContainer theme={theme} {...subContainerProps}>
        {children}
      </StyledSectionSubContainer>
    </StyledSectionContainer>
  );
};

export const SectionTitle = styled.div`
  font-size: ${(props) => props.fontSize || "8em"};
  color: ${(props) => props.color};
  font-family: ${(props) => props.fontFamily};
  letter-spacing: 0.1em;
  line-height: 1em;
  text-align: center;
  ${({ theme }) => theme.breakpoints.down("md")} {
    font-size: ${(props) => props.fontSize || "4em"};
  }
`;

export const SectionHeadline = styled.div`
  font-size: ${(props) => props.fontSize || "1.5em"};
  max-width: ${(props) => props.maxWidth || "750px"};
  color: ${(props) => props.color};
  font-family: ${(props) => props.fontFamily};
  font-weight: 500;
  text-align: ${(props) => props.textAlign || "center"};
  justify-content: ${(props) => props.justifyContent || "center"};
  ${({ theme }) => theme.breakpoints.down("md")} {
    font-size: ${(props) => props.fontSize || "1.5em"};
  }
`;
