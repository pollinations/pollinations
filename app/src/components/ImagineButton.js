import React from 'react';
import { Button, CircularProgress } from "@material-ui/core";
import { CustomTooltip } from './CustomTooltip';
import { Colors } from "../styles/global";

export function ImagineButton({ handleButtonClick, isLoading, isInputChanged }) {
  return (
    <CustomTooltip title="Generate an alternative image from the current prompt/settings.">
      <Button
        variant="contained"
        color="primary"
        onClick={handleButtonClick}
        disabled={isLoading}
        style={{
          backgroundColor: isInputChanged ? Colors.lime : Colors.lime,
          color: isInputChanged ? null : Colors.offblack,
          fontSize: '1.3rem',
          fontFamily: 'Uncut-Sans-Variable',
          fontStyle: 'normal',
          fontWeight: 600,
          height: "60px",
          width: "160px",
          position: "relative",
          marginTop: "0em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.1em", // Increased letter spacing
        }}
      >
        {isLoading ? <span></span> : "Pollinate"}
        {isLoading && (
          <CircularProgress
            size={24}
            style={{
              color: "black",
              position: "absolute",
              top: "50%",
              left: "50%",
              marginTop: -12,
              marginLeft: -12,
            }}
          />
        )}
      </Button>
    </CustomTooltip>
  )
}