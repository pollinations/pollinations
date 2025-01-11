import React from 'react';
import { Button } from "@material-ui/core";
import { Colors } from "../config/global";
import { styled } from '@mui/material/styles';

const StyledButton = styled(Button)(({ theme, isLoading, isInputChanged }) => ({
  backgroundColor: isLoading ? 'orange' : Colors.lime,
  color: isInputChanged ? null : Colors.offblack,
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
  animation: isLoading ? 'smoothBlink 1s ease-in-out infinite' : 'none',
  '&:hover': {
    backgroundColor: isLoading ? 'darkorange' : `${Colors.lime}90`,
  },
}));


export function ImagineButton({ handleButtonClick, isLoading, isInputChanged }) {
  return (
    <div style={{ position: 'relative', display: 'block', width: '100%' }}>
      <StyledButton
        variant="contained"
        color="primary"
        onClick={handleButtonClick}
        isLoading={isLoading}
        isInputChanged={isInputChanged}
      >
        {isLoading ? "Cancel" : "Create"}
      </StyledButton>

      <style>
        {`
          @keyframes smoothBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}
      </style>
    </div>
  )
}