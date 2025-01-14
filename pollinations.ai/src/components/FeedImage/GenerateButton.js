import React from 'react';
import { Button } from "@mui/material";
import { Colors } from "../../config/global";
import { styled, keyframes } from '@mui/material/styles';

// Define the animation
const smoothBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.333; }
`;

// Create a styled Button with shouldForwardProp to omit 'isLoading'
const StyledButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'isLoading',
})(({ theme, isLoading }) => {
  const backgroundColor = Colors.lime;
  const hoverBackgroundColor = isLoading ? Colors.offwhite : `${Colors.lime}90`;
  const animation = isLoading ? `${smoothBlink} 1s ease-in-out infinite` : 'none';

  return {
    backgroundColor: backgroundColor,
    color: Colors.offblack,
    fontSize: '1.5rem',
    fontFamily: 'Uncut-Sans-Variable',
    fontStyle: 'normal',
    fontWeight: 800,
    height: "60px",
    width: "100%",
    position: "relative",
    marginTop: "0em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    letterSpacing: "0.1em",
    animation: animation,
    '&:hover': {
      backgroundColor: hoverBackgroundColor,
    },
  };
});

export function GenerateButton({ handleButtonClick, isLoading }) {
  return (
    <div style={{ position: 'relative', display: 'block', width: '100%' }}>
      <StyledButton
        variant="contained"
        color="primary"
        onClick={handleButtonClick}
        isLoading={isLoading} // This prop is now excluded from the DOM
      >
        {isLoading ? "Wait" : "Create"}
      </StyledButton>
    </div>
  );
}