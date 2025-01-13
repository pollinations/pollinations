import React, { useState, useEffect } from "react"
import { Grid, Typography, TextareaAutosize, useMediaQuery } from "@material-ui/core"
import ReactMarkdown from "react-markdown"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"

const CHARACTER_LIMIT = 200;
const WARNING_THRESHOLD = 180;

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
    const [charCount, setCharCount] = useState(0);
    const [isOverLimit, setIsOverLimit] = useState(false);
    const [showWarning, setShowWarning] = useState(false);

    useEffect(() => {
      const count = imageParams.prompt?.length || 0;
      setCharCount(count);
      setIsOverLimit(count > CHARACTER_LIMIT);
      setShowWarning(count >= WARNING_THRESHOLD);
    }, [imageParams.prompt]);

    const handlePromptChange = (e) => {
      const newValue = e.target.value;
      handleParamChange("prompt", newValue);
    };
  
    return (
      <Grid item xs={12}>
        {isStopped && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <Typography variant="body2" style={{ color: '#f5f5f5', fontWeight: "normal" }}>
              Prompt
            </Typography>
            <Typography 
              variant="body2" 
              style={{ 
                color: isOverLimit ? '#ff4444' : showWarning ? '#ffaa00' : '#f5f5f5',
                fontWeight: isOverLimit ? "bold" : "normal"
              }}
            >
              {charCount}/{CHARACTER_LIMIT} characters
              {showWarning && !isOverLimit && " (approaching limit)"}
              {isOverLimit && " (exceeds limit)"}
            </Typography>
          </div>
        )}
        {isStopped ? (
          <TextareaAutosize
                    style={{
                        width: "100%",
                        height: "200px",
                        backgroundColor: "transparent",
                        border: `0.1px solid ${isOverLimit ? '#ff4444' : showWarning ? '#ffaa00' : '#4A4A4A'}`,
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
                    onChange={handlePromptChange}
                    onFocus={handleFocus}
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