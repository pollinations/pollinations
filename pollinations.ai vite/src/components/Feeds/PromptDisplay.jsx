import React, { useState, useEffect, useRef } from "react";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import styled from "@emotion/styled";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";

const LabelStyle = {
    color: Colors.gray2,
    fontSize: "0.9em",
    fontFamily: Fonts?.parameter || "inherit",
    marginBottom: "4px",
};

// Styled components for display
const StyledTextArea = styled(TextareaAutosize)`
  font-family: ${Fonts?.parameter || "inherit"};
  font-size: 1.1em;
  color: ${Colors.offwhite};
  padding: 15px;
  resize: none;
  background-color: transparent;
  border: none;
  width: 100%;
  line-height: 1.5em;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  
  &:focus {
    outline: none;
  }
  
  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  msOverflowStyle: none;  /* IE and Edge */
  scrollbarWidth: none;     /* Firefox */
`;

// Create the styled component with the shouldForwardProp option to filter out isEditMode
const PromptContainer = styled(Box, {
    shouldForwardProp: (prop) =>
        prop !== "isEditMode" && prop !== "backgroundColor",
})`
  width: 100%; /* Explicitly set width to 100% */
  min-height: 130px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 0px solid ${Colors.gray2};
  transition: all 0.2s ease, border-color 0.3s ease;
  cursor: ${(props) => (props.isEditMode ? "text" : "pointer")};
  /* Remove the default resize behavior */
  resize: none;
  position: relative;
  background-color: ${Colors.offblack2};
  border-radius: 0em;
  
  /* Disable any browser-native resize handles */
  &::-webkit-resizer {
    display: none;
  }
  
  /* Hide scrollbar while keeping functionality */
  /* For WebKit browsers */
  &::-webkit-scrollbar {
    display: none;
  }
  
  /* For Firefox and other browsers */
  scrollbarWidth: none;
  -ms-overflow-style: none;
  
  &:hover {
    border-color: ${Colors.lime};
  }

  &:focus-within {
    border-color: ${Colors.lime};
  }
  
  /* Show resize cursor on bottom-right corner */
  &.prompt-container {
    cursor: ${(props) => (props.isEditMode ? "text" : "pointer")};
  }
`;

// Styled resize handle that stays fixed in the bottom right corner
const ResizeHandle = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 36px;
  height: 36px;
  cursor: nwse-resize;
  z-index: 10;
  pointer-events: auto;
  background-color: transparent;
  touch-action: none; /* Prevent touch scroll while resizing */

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 30px 30px;
    border-color: transparent transparent ${Colors.lime} transparent;
    opacity: 1;
    transition: opacity 0.2s ease, border-width 0.2s ease;
  }
  
  &:hover::after {
    opacity: 1;
    border-width: 0 0 24px 24px;
  }
`;

/**
 * Shared PromptDisplay component for both image and text feeds
 *
 * @param {Object} props
 * @param {string} props.itemType - "image" or "text"
 * @param {string} props.backgroundColor - Background color for the prompt box
 * @param {Object} props.item - Current item (image or text entry)
 * @param {boolean} props.isLoading - Whether item is loading
 * @param {boolean} props.isEditMode - Whether we're in edit mode
 * @param {Function} props.onPromptChange - Callback for prompt changes
 * @param {Function} props.onEditModeSwitch - Callback to switch to edit mode
 * @param {Function} props.setIsInputChanged - Function to set input changed state
 * @param {string} props.promptTooltip - Tooltip text for prompt field
 * @param {string} props.sharedPrompt - Shared prompt state (for text feed)
 * @param {Function} props.setSharedPrompt - Shared prompt setter (for text feed)
 */
export function PromptDisplay({
    itemType = "text",
    backgroundColor = Colors.offblack,
    item,
    isLoading,
    isEditMode,
    onPromptChange,
    onEditModeSwitch,
    setIsInputChanged,
    promptTooltip,
    sharedPrompt,
    setSharedPrompt,
}) {
    // Local prompt state
    const [localPrompt, setLocalPrompt] = useState("");

    // Track the prompt container height
    const [promptHeight, setPromptHeight] = useState(() => {
        return localStorage.getItem("promptHeight")
            ? parseInt(localStorage.getItem("promptHeight"), 10)
            : 200;
    });

    // Add previous edit mode state tracking
    const prevEditModeRef = useRef(isEditMode);

    // Add theme and media query for responsive design
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    // Ref for the container element
    const containerRef = useRef(null);
    // Ref for the resize handle
    const resizeHandleRef = useRef(null);

    // Debug logs for props
    useEffect(() => {
        // Removed excessive logging
    }, [isEditMode, sharedPrompt, item]);

    // Figure out the current prompt based on item type and state
    const getPromptFromItem = () => {
        if (itemType === "text" && item?.parameters?.messages) {
            const userMessage = item.parameters.messages.find(
                (msg) => msg?.role === "user",
            );
            const prompt = userMessage?.content || "";
            return prompt;
        }

        // Handle item.prompt which could be a string or an object
        if (item?.prompt) {
            if (typeof item.prompt === "object") {
                // Return the object directly; getPromptContent will handle it later
                return item.prompt;
            }
            return item.prompt;
        }

        return "";
    };

    // Use shared prompt if available, otherwise use local or item prompt
    const currentPrompt =
        sharedPrompt !== undefined
            ? sharedPrompt
            : localPrompt || getPromptFromItem();

    // Ensure currentPrompt is a string for ReactMarkdown
    const getPromptContent = (prompt) => {
        // Removed repetitive log

        if (typeof prompt === "string") {
            return prompt;
        }
        // Handle object prompts (e.g. {type: 'text', content: 'string'})
        if (prompt && typeof prompt === "object") {
            // If it has a text or content property, use that
            if (prompt.text) {
                // Removed repetitive log
                return prompt.text;
            }
            if (prompt.content) {
                // Removed repetitive log
                return prompt.content;
            }
            // Last resort: stringify the object
            const stringified = JSON.stringify(prompt);
            // Removed repetitive log
            return stringified;
        }
        // Default to empty string for null/undefined/other types
        // Removed repetitive log
        return "";
    };

    // Handle prompt changes
    const handlePromptChange = (newPrompt) => {
        // If current prompt is an object with a text field, preserve the object structure
        const updatedValue =
            typeof currentPrompt === "object" &&
            currentPrompt !== null &&
            "text" in currentPrompt
                ? { ...currentPrompt, text: newPrompt }
                : newPrompt;

        if (setSharedPrompt) {
            setSharedPrompt(updatedValue);
        } else {
            setLocalPrompt(updatedValue);
        }

        if (onPromptChange) {
            onPromptChange(updatedValue);
        }

        if (setIsInputChanged) {
            setIsInputChanged(true);
        }
    };

    // Initialize local prompt from item when it changes
    useEffect(() => {
        const promptFromItem = getPromptFromItem();

        // Only update the prompt if:
        // 1. We're in feed mode and the item has changed, or
        // 2. We've just switched from edit mode to feed mode
        const wasInEditMode = prevEditModeRef.current;
        const isNowInFeedMode = !isEditMode;
        const switchedToFeedMode = wasInEditMode && isNowInFeedMode;

        if (promptFromItem && (switchedToFeedMode || (!isEditMode && item))) {
            setLocalPrompt(promptFromItem);
        }

        // Update the previous edit mode ref
        prevEditModeRef.current = isEditMode;
    }, [item, isEditMode]);

    // Setup resize handling
    useEffect(() => {
        if (!containerRef.current || !resizeHandleRef.current) return;

        // Set initial height based on device type
        if (isMobile) {
            containerRef.current.style.height = "200px";
        } else {
            containerRef.current.style.height = `${promptHeight}px`;
        }

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        const handleMouseDown = (e) => {
            // Only handle resize if clicking on the resize handle and not on mobile
            if (
                !isMobile &&
                (e.target === resizeHandleRef.current ||
                    resizeHandleRef.current.contains(e.target))
            ) {
                isResizing = true;
                startY = e.clientY;
                startHeight = containerRef.current.offsetHeight;
                e.preventDefault(); // Prevent text selection during resize
            }
        };

        const handleMouseMove = (e) => {
            if (!isResizing || isMobile) return;

            const newHeight = startHeight + (e.clientY - startY);
            if (newHeight > 130) {
                // Enforce minimum height
                containerRef.current.style.height = `${newHeight}px`;
            }
        };

        const handleMouseUp = () => {
            if (isResizing && !isMobile) {
                const newHeight = containerRef.current.clientHeight;
                localStorage.setItem("promptHeight", newHeight.toString());
                setPromptHeight(newHeight);
                isResizing = false;
            }
        };

        // Add event listeners
        resizeHandleRef.current.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        // Ensure mobile height stays fixed
        const resizeObserver = new ResizeObserver(() => {
            if (isMobile && containerRef.current) {
                containerRef.current.style.height = "200px";
            }
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            if (resizeHandleRef.current) {
                resizeHandleRef.current.removeEventListener(
                    "mousedown",
                    handleMouseDown,
                );
            }
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            resizeObserver.disconnect();
        };
    }, [isMobile, promptHeight]);

    // Render the tooltip label
    const renderTooltipLabel = () => {
        if (React.isValidElement(promptTooltip)) {
            return <>{promptTooltip}</>;
        }

        return typeof promptTooltip === "string" ? promptTooltip : "Prompt";
    };

    return (
        <Box width="100%">
            {isEditMode && (
                <Typography sx={LabelStyle}>{renderTooltipLabel()}</Typography>
            )}

            <Box position="relative" sx={{ width: "100%" }}>
                <PromptContainer
                    ref={containerRef}
                    className="prompt-container"
                    isEditMode={isEditMode}
                    onClick={!isEditMode ? onEditModeSwitch : undefined}
                    sx={isMobile ? { height: "200px !important" } : {}}
                >
                    {isEditMode
                        ? <StyledTextArea
                              value={getPromptContent(currentPrompt)}
                              onChange={(e) =>
                                  handlePromptChange(e.target.value)
                              }
                              placeholder="Enter your prompt here..."
                              minRows={3}
                              maxRows={12}
                              style={{
                                  width: "100%",
                                  fontFamily: Fonts.parameter,
                                  fontSize: "1.1em",
                                  lineHeight: "1.5em",
                              }}
                          />
                        : <Box sx={{ padding: "15px" }}>
                              {itemType === "text"
                                  ? <Typography
                                        sx={{
                                            fontFamily: Fonts.parameter,
                                            fontSize: "1.1em",
                                            color: Colors.offwhite,
                                            margin: 0,
                                            lineHeight: "1.5em",
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {getPromptContent(currentPrompt)}
                                    </Typography>
                                  : <ReactMarkdown
                                        components={{
                                            p: ({ node, ...props }) => (
                                                <p
                                                    style={{
                                                        margin: 0,
                                                        fontFamily:
                                                            Fonts.parameter,
                                                        fontSize: "1.1em",
                                                        color: Colors.offwhite,
                                                        lineHeight: "1.5em",
                                                    }}
                                                    {...props}
                                                />
                                            ),
                                        }}
                                    >
                                        {getPromptContent(currentPrompt)}
                                    </ReactMarkdown>}
                          </Box>}
                </PromptContainer>

                {/* Only show resize handle on non-mobile devices */}
                {!isMobile && <ResizeHandle ref={resizeHandleRef} />}
            </Box>
        </Box>
    );
}
