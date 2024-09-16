import React from "react"
import { Grid, Typography, TextareaAutosize } from "@material-ui/core"
import { Colors } from "../../../styles/global"

export function TextPrompt({ imageParams, handleParamChange, handleFocus, isLoading }) {
    return (
        <Grid item xs={12}>
            <Typography variant="body2" style={{ color: Colors.lime, fontWeight: "bold" }}>
                Prompt
            </Typography>
            <TextareaAutosize
                style={{
                    width: "100%",
                    height: "100px",
                    backgroundColor: "transparent",
                    border: `0.1px solid #4A4A4A`,
                    borderRadius: "5px",
                    color: Colors.offwhite,
                    padding: "10px",
                    fontSize: "1.1rem",
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