import React from "react";
import styled from "@emotion/styled";
import { Button as MuiButton } from "@mui/material";
import { Colors, Fonts } from "../config/global";

const StyledButton = styled(MuiButton, {
  shouldForwardProp: (prop) => prop !== 'isLoading' && prop !== 'borderColor' && prop !== 'backgroundColor'
})`
  border: ${(props) => (props.borderColor ? `3px solid ${props.borderColor}` : "none")};
  background-color: ${(props) => props.backgroundColor || "transparent"};
  color: ${(props) => props.textColor || props.borderColor || "transparent"};
  font-size: ${(props) => props.fontSize || "1.5em"};
  font-weight: normal;
  height: ${(props) => props.height || "auto"};
  min-height: ${(props) => props.minHeight || "60px"};
  border-radius: ${(props) => props.borderRadius || "0px"};
  padding: 0px 1em;
  transition: all 0.6s ease;
  opacity: ${(props) => (props.isLoading ? 0.7 : 1)};
  position: relative;

  &:hover {
    background-color: ${(props) =>
      props.backgroundColor ? `${props.backgroundColor}B3` : "transparent"};
    border-color: ${(props) => (props.borderColor ? `${props.borderColor}B3` : "none")};
    filter: brightness(105%);
  }

  &::after {
    ${(props) =>
      props.isLoading &&
      `
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background-color: ${props.textColor || props.borderColor || "transparent"};
      animation: loadingProgress 1.5s infinite ease-in-out;
      width: 100%;
    `}
  }

  @keyframes loadingProgress {
    0% { width: 0%; left: 0%; }
    50% { width: 100%; left: 0%; }
    100% { width: 0%; left: 100%; }
  }
`;

export const Button = React.forwardRef(
  (
    {
      onClick,
      isLoading,
      borderColor,
      backgroundColor,
      textColor,
      fontSize,
      height,
      minHeight,
      borderRadius,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <StyledButton
        ref={ref}
        onClick={onClick}
        disabled={isLoading}
        isLoading={isLoading}
        borderColor={borderColor}
        backgroundColor={backgroundColor}
        textColor={textColor}
        fontSize={fontSize}
        height={height}
        minHeight={minHeight}
        borderRadius={borderRadius}
        {...rest}
      >
        {children}
      </StyledButton>
    );
  }
);
