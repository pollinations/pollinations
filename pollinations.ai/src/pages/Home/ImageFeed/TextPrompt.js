import React from "react"
import { Grid, Typography, TextareaAutosize, useMediaQuery } from "@material-ui/core"
import ReactMarkdown from "react-markdown"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"

export function TextPrompt({
  imageParams,
  handleParamChange,
  handleFocus,
  isLoading,
  isStopped,
  stop,
  switchToEditMode,
  edit,
}) {
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)

  const scrollbarStyles = {
    overflowY: "scroll",
    scrollbarWidth: "thin",
    scrollbarColor: `${Colors.gray1} transparent`,
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
        <TextareaAutosize
          style={{
            width: "100%",
            height: "150px",
            backgroundColor: "transparent",
            border: edit ? "none" : "none",
            borderRadius: "5px",
            color: Colors.offwhite,
            fontSize: isMobile ? "1.5rem" : "1.2rem",
            resize: "vertical",
            overflow: "auto",

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
            border: edit ? `0.1px solid ${Colors.offwhite}` : "none",
            borderRadius: "5px",
            color: Colors.lime,
            fontSize: edit ? "1.5rem" : "1.2rem",
            cursor: "pointer",
            overflow: "auto",
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
