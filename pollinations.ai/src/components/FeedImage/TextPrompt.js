    // Start of Selection
    import React from "react"
    import { Typography, TextareaAutosize, Box } from "@mui/material"
    import ReactMarkdown from "react-markdown"
    import { Colors } from "../../config/global"
    
    export function TextPrompt({
      imageParams,
      handleParamChange,
      handleFocus,
      isStopped,
      stop,
      switchToEditMode,
      edit,
    }) {
    
      const scrollbarStyles = {
        overflowY: "scroll",
        scrollbarWidth: "auto",
        scrollbarColor: `${isStopped ? Colors.gray2 : Colors.lime} transparent`,
        msOverflowStyle: "none",
      };
    
      return (
        <Box>
          {isStopped && (
            <Typography component="div" variant="body2" style={{ color: Colors.gray2, fontWeight: "normal" }}>
              Prompt
            </Typography>
          )}
          {isStopped ? (
            <TextareaAutosize
              variant="outlined"
              style={{
                width: "100%",
                height: "150px",
                backgroundColor: "transparent",
                border: `0.1px solid ${Colors.gray1}60`,
                borderRadius: "5px",
                color: Colors.offwhite,
                padding: "15px",
                resize: "vertical",
                overflow: "auto",
                ...scrollbarStyles,
              }}
              sx={{
                fontSize: {
                  xs: "1.5rem",
                  md: "1.2rem"
                }
              }}
              value={imageParams.prompt}
              onChange={(e) => handleParamChange("prompt", e.target.value)}
              onFocus={handleFocus}
            />
          ) : (
            <Box
              style={{
                width: "100%",
                height: "150px",
                backgroundColor: "transparent",
                color: Colors.lime,
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
              <ReactMarkdown
                style={{
                  fontSize: edit ? "1.5rem" : "1.2rem"
                }}
              >
                {imageParams.prompt}
              </ReactMarkdown>
            </Box>
          )}
        </Box>
      )
    }