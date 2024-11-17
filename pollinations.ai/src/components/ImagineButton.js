import React from 'react';
import { Button, CircularProgress } from "@material-ui/core";
import { CustomTooltip } from './CustomTooltip';
import { Colors } from "../styles/global";

export function ImagineButton({ handleButtonClick, isLoading, isInputChanged }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <CustomTooltip title="Generate an alternative image from the current prompt/settings.">
        <Button
          variant="contained"
          color="primary"
          onClick={handleButtonClick}
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
            letterSpacing: "0.1em",
          }}
        >
          {isLoading ? "Cancel" : "Pollinate"}
        </Button>
      </CustomTooltip>
      {isLoading && (
        <CircularProgress
          size={24}
          style={{
            position: 'absolute',
            right: -36,
            top: '50%',
            marginTop: -12,
            color: Colors.lime
          }}
        />
      )}
    </div>
  )
}