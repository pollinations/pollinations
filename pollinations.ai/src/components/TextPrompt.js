import React from "react"
import { Grid, Typography, TextareaAutosize, useMediaQuery } from "@material-ui/core"
import ReactMarkdown from "react-markdown"
import { Colors, MOBILE_BREAKPOINT } from "../config/global"

export function TextPrompt({
  imageParams,
  handleParamChange,
  handleFocus,
  isStopped,
  stop,
  switchToEditMode,
  edit,
}) {
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)

  const scrollbarStyles = {
    overflowY: "scroll",
    scrollbarWidth: "auto",
    scrollbarColor: `${isStopped ? Colors.gray2 : Colors.lime} transparent`,
    msOverflowStyle: "none",
  };

  return (
    <Grid item xs={12} >
      {isStopped && (
        <Typography variant="body2" style={{ color: Colors.gray2, fontWeight: "normal" }}>
          Prompt
        </Typography>
      )}
      {isStopped ? (
            // Start of Selection
            <TextareaAutosize
              variant="outlined"
              style={{
                width: "100%",
                height: "150px",
                backgroundColor: "transparent",
                border: `0.1px solid ${Colors.gray1}60`,
                borderRadius: "5px",
                color: Colors.offwhite,
                fontSize: isMobile ? "1.5rem" : "1.2rem",
                padding: "10px",
                resize: "vertical",
                overflow: "auto",
                padding: "15px",
                ...scrollbarStyles,
              }}
              value={imageParams.prompt}
              onChange={(e) => handleParamChange("prompt", e.target.value)}
              onFocus={handleFocus}
            />
      ) : (
        <div
          style={{
            width: "100%",
            height: "150px",
            backgroundColor: "transparent",
            color: Colors.lime,
            fontSize: edit ? "1.5rem" : "1.2rem",
            cursor: "pointer",
            overflowY: "auto",
            overflowX: "hidden", // Prevent horizontal overflow
            padding: "15px",


            ...scrollbarStyles,
          }}
          onClick={() => {
            stop(true)
            switchToEditMode()
          }}
        >
          <ReactMarkdown>{imageParams.prompt}</ReactMarkdown>
        </div>
      )}
    </Grid>
  )
}
