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
  }) {
    const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`);
  
    return (
      <Grid item xs={12}>
        {isStopped && (
          <Typography variant="body2" style={{ color: '#f5f5f5', fontWeight: "normal" }}>
            Prompt
          </Typography>
        )}
        {isStopped ? (
          <TextareaAutosize
                    style={{
                        width: "100%",
                        height: "200px",
                        backgroundColor: "transparent",
                        border: `0.1px solid #4A4A4A`,
                        borderRadius: "5px",
                        color: Colors.offwhite,
                        paddingLeft: "15px",
                        paddingRight: "15px",
                        paddingTop: "10px",
                        fontSize: isMobile ? "1.5rem" : "1.2rem",                    
                        overflow: "auto",
                        scrollbarWidth: "none", // For Firefox
                        msOverflowStyle: "none", // For Internet Explorer and Edge
                    }}
                    value={imageParams.prompt}
                    onChange={(e) => handleParamChange("prompt", e.target.value)}
                    onFocus={handleFocus}
                    disabled={isLoading}
                />
            ) : (
                <div
                    style={{
                        width: "100%",
                        height: "160px",
                        backgroundColor: "transparent",
                        border: `0.1px solid #4A4A4A`,
                        borderRadius: "5px",
                        color: Colors.offwhite,
                        paddingTop: "0px",
                        paddingLeft: "15px",
                        paddingRight: "15px",
                        fontSize: isMobile ? "1.5rem" : "1.5rem",
                        overflow: "auto",
                        scrollbarWidth: "none", // For Firefox
                        msOverflowStyle: "none", // For Internet Explorer and Edge
                        textAlign: "center", // Center the text horizontally
                        cursor: "pointer" // Indicate that the div is clickable
                    }}
                    onClick={() => {
                        stop(true);              // Use the stop function to stop the slideshow
                        switchToEditMode();  // Switch to edit mode when clicked
                      }}
                >
                    <ReactMarkdown>{imageParams.prompt}</ReactMarkdown>
                </div>
            )}
        </Grid>
    )
}