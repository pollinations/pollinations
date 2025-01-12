import React from 'react';
import { Button } from "@mui/material";
import { Colors } from "../../config/global";
import { styled } from '@mui/material/styles';

const StyledButton = styled(Button)(({ theme, isLoading, isInputChanged }) => {
  const backgroundColor = isLoading ? 'orange' : Colors.lime;
  const hoverBackgroundColor = isLoading ? 'darkorange' : `${Colors.lime}90`;
  const animation = isLoading ? 'smoothBlink 1s ease-in-out infinite' : 'none';

  return {
    backgroundColor: backgroundColor,
    color: isInputChanged ? Colors.offblack : Colors.offblack,
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
    '@keyframes smoothBlink': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0 },
    },
  };
});


export function GenerateButton({ handleButtonClick, isLoading, isInputChanged }) {
  return (
    <div style={{ position: 'relative', display: 'block', width: '100%' }}>
      <StyledButton
        variant="contained"
        color="primary"
        onClick={handleButtonClick}
      >
        {isLoading ? "Cancel" : "Create"}
      </StyledButton>
    </div>
  );
}