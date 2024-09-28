import React from "react"
import { Grid, Typography, TextareaAutosize } from "@material-ui/core"
import { Colors } from "../../../styles/global"

export function TextPrompt({ imageParams, handleParamChange, handleFocus, isLoading, isStopped }) {
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
                    height: "160px",
                    backgroundColor: "transparent",
                    border: isStopped ? `0.1px solid #4A4A4A` : "none",
                    borderRadius: "5px",
                    color: Colors.offwhite,
                    paddingLeft: "15px",
                    paddingRight: "15px",
                    paddingTop: "10",
                    fontSize: "1.5rem",
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