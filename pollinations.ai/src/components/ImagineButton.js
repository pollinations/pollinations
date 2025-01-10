import React from 'react';
import { Button, CircularProgress } from "@material-ui/core";
import { Colors } from "../styles/global";

export function ImagineButton({ handleButtonClick, isLoading, isInputChanged }) {
  return (
    <div style={{ position: 'relative', display: 'block', width: '100%' }}>
      <Button
        variant="contained"
        color="primary"
        onClick={handleButtonClick}
        style={{
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
        }}
      >
        {isLoading ? "Cancel" : "Create"}
      </Button>

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