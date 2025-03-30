import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import styled from '@emotion/styled';
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";

const LabelStyle = {
  color: `${Colors.offwhite}99`,
  fontSize: '1em',
  fontFamily: Fonts?.parameter || 'inherit',
  marginBottom: '4px'
};

// Styled components for display
const StyledTextArea = styled(TextareaAutosize)`
  font-family: ${Fonts?.parameter || 'inherit'};
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
  shouldForwardProp: (prop) => prop !== 'isEditMode',
})`
  min-height: 130px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 0.5px solid ${Colors.gray2};
  transition: all 0.2s ease, border-color 0.3s ease;
  cursor: ${props => props.isEditMode ? 'text' : 'pointer'};
  resize: vertical;
  position: relative;
  
  /* Resize handle triangle in bottom right corner */
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 20px 20px;
    border-color: transparent transparent ${Colors.lime} transparent;
    opacity: 0.7;
    transition: opacity 0.3s ease, border-width 0.2s ease;
    pointer-events: auto;
    z-index: 2;
    cursor: nwse-resize;
  }
  
  &:hover::after {
    opacity: 1;
    border-width: 0 0 24px 24px;
  }
  
  /* Scrollbar styles for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    width: 6px;
    background: transparent;
  }
  
  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: ${props => props.isEditMode ? `${Colors.lime}60` : 'transparent'};
    border-radius: 3px;
  }
  
  /* Show scrollbar on hover */
  &:hover::-webkit-scrollbar-thumb {
    background-color: ${props => props.isEditMode ? `${Colors.lime}99` : 'transparent'};
  }
  
  /* Firefox scrollbar styling */
  scrollbarWidth: ${props => props.isEditMode ? 'thin' : 'none'};
  scrollbarColor: ${props => props.isEditMode ? `${Colors.lime}60 transparent` : 'transparent transparent'};
  
  /* Show scrollbar on hover for Firefox */
  &:hover {
    scrollbarWidth: ${props => props.isEditMode ? 'thin' : 'none'};
    scrollbarColor: ${props => props.isEditMode ? `${Colors.lime}99 transparent` : 'transparent transparent'};
    border-color: ${Colors.lime};
    background-color: transparent;
  }

  &:focus-within {
    border-color: ${Colors.lime};
  }
  
  /* Show resize cursor on bottom-right corner */
  &.prompt-container {
    cursor: ${props => props.isEditMode ? 'text' : 'pointer'};
  }
  
  &.prompt-container:hover {
    &::after {
      cursor: nwse-resize;
    }
  }
  
  /* Style adjustment for bottom-right corner to improve resize grip area */
  &.prompt-container:hover::before {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    z-index: 1;
    background-color: transparent;
  }
`;

/**
 * Shared PromptDisplay component for both image and text feeds
 * 
 * @param {Object} props
 * @param {string} props.itemType - "image" or "text"
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
  item,
  isLoading,
  isEditMode,
  onPromptChange,
  onEditModeSwitch,
  setIsInputChanged,
  promptTooltip,
  sharedPrompt,
  setSharedPrompt
}) {
  // Local prompt state
  const [localPrompt, setLocalPrompt] = useState('');
  
  // Track the prompt container height
  const [promptHeight, setPromptHeight] = useState(() => {
    return localStorage.getItem('promptHeight') ? parseInt(localStorage.getItem('promptHeight'), 10) : 200;
  });
  
  // Ref for the container element
  const containerRef = useRef(null);
  
  // Figure out the current prompt based on item type and state
  const getPromptFromItem = () => {
    if (itemType === "text" && item?.parameters?.messages) {
      const userMessage = item.parameters.messages.find(msg => msg?.role === 'user');
      return userMessage?.content || '';
    }
    
    // Handle item.prompt which could be a string or an object
    if (item?.prompt) {
      if (typeof item.prompt === 'object') {
        // Return the object directly; getPromptContent will handle it later
        return item.prompt;
      }
      return item.prompt;
    }
    
    return '';
  };
  
  // Use shared prompt if available, otherwise use local or item prompt
  const currentPrompt = 
    (sharedPrompt !== undefined) ? sharedPrompt : 
    (localPrompt || getPromptFromItem());
  
  // Ensure currentPrompt is a string for ReactMarkdown
  const getPromptContent = (prompt) => {
    if (typeof prompt === 'string') {
      return prompt;
    }
    // Handle object prompts (e.g. {type: 'text', content: 'string'})
    if (prompt && typeof prompt === 'object') {
      // If it has a text or content property, use that
      if (prompt.text) return prompt.text;
      if (prompt.content) return prompt.content;
      // Last resort: stringify the object
      return JSON.stringify(prompt);
    }
    // Default to empty string for null/undefined/other types
    return '';
  };
  
  // Handle prompt changes
  const handlePromptChange = (newPrompt) => {
    // If current prompt is an object with a text field, preserve the object structure
    const updatedValue = 
      typeof currentPrompt === 'object' && currentPrompt !== null && 'text' in currentPrompt 
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
    if (promptFromItem && !isEditMode) {
      setLocalPrompt(promptFromItem);
    }
  }, [item, isEditMode]);
  
  // Setup resize handling
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Set initial height
    containerRef.current.style.height = `${promptHeight}px`;
    
    let isResizing = false;
    
    const handleMouseDown = () => {
      isResizing = true;
    };
    
    const handleMouseUp = () => {
      if (isResizing) {
        const newHeight = containerRef.current.clientHeight;
        localStorage.setItem('promptHeight', newHeight.toString());
        setPromptHeight(newHeight);
        isResizing = false;
      }
    };
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (isResizing && entries[0]) {
        const newHeight = entries[0].contentRect.height;
        if (newHeight > 0) {
          setPromptHeight(newHeight);
        }
      }
    });
    
    containerRef.current.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mouseup', handleMouseUp);
        resizeObserver.disconnect();
      }
    };
  }, []);
  
  // Render the tooltip label
  const renderTooltipLabel = () => {
    if (React.isValidElement(promptTooltip)) {
      return <>{promptTooltip}</>;
    }
    
    return typeof promptTooltip === 'string' ? promptTooltip : "Prompt";
  };
  
  return (
    <Box width="100%">
      <Typography sx={LabelStyle}>
        {renderTooltipLabel()}
      </Typography>
      
      <PromptContainer 
        ref={containerRef}
        className="prompt-container"
        isEditMode={isEditMode}
        onClick={!isEditMode ? onEditModeSwitch : undefined}
      >
        {isEditMode ? (
          <StyledTextArea
            value={getPromptContent(currentPrompt)}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="Enter your prompt here..."
            minRows={3}
            maxRows={12}
            style={{ 
              width: '100%',
              fontFamily: Fonts.parameter,
              fontSize: '1.1em',
              lineHeight: '1.5em'
            }}
          />
        ) : (
          <Box sx={{ padding: '15px' }}>
            {itemType === "text" ? (
              <Typography
                sx={{
                  fontFamily: Fonts.parameter,
                  fontSize: '1.1em',
                  color: Colors.offwhite,
                  margin: 0,
                  lineHeight: '1.5em',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {getPromptContent(currentPrompt)}
              </Typography>
            ) : (
              <ReactMarkdown
                components={{
                  p: ({ node, ...props }) => (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: Fonts.parameter,
                        fontSize: '1.1em',
                        color: Colors.offwhite,
                        lineHeight: '1.5em',
                      }}
                      {...props}
                    />
                  ),
                }}
              >
                {getPromptContent(currentPrompt)}
              </ReactMarkdown>
            )}
          </Box>
        )}
      </PromptContainer>
    </Box>
  );
} 