import React from "react"
import { Grid, Typography, TextareaAutosize, useMediaQuery } from "@material-ui/core"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"

export function TextPrompt({ imageParams, handleParamChange, handleFocus, isLoading, isStopped }) {
    const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)

    return (
        <Grid item xs={12}>
            {isStopped && (
                <Typography variant="body2" style={{ color: '#f5f5f5', fontWeight: "normal" }}>
                    Prompt
                </Typography>
            )}
            <TextareaAutosize
                style={{
                    width: "100%",
                    height: isStopped ? "340px" : "160px",
                    backgroundColor: "transparent",
                    border: isStopped ? `0.1px solid #4A4A4A` : "none",
                    borderRadius: "5px",
                    color: Colors.offwhite,
                    paddingLeft: "15px",
                    paddingRight: "15px",
                    paddingTop: "10px",
                    fontSize: isMobile ? "1.5rem" : "1.1rem",                    
                    overflow: "auto",
                    scrollbarWidth: "none", // For Firefox
                    msOverflowStyle: "none", // For Internet Explorer and Edge
                }}
                value={imageParams.prompt}
                onChange={(e) => handleParamChange("prompt", e.target.value)}
                onFocus={handleFocus}
                disabled={isLoading}
            />
        </Grid>
    )
}