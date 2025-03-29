import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import styled from '@emotion/styled';
import TextareaAutosize from "react-textarea-autosize";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { noLink } from "../../config/llmTransforms";
import ReactMarkdown from "react-markdown";

const LabelStyle = {
  color: `${Colors.offwhite}99`,
  fontSize: '1em',
  fontFamily: Fonts?.parameter || 'inherit',
  marginBottom: '4px'
};

// Styled components for display
const StyledTextArea = styled(TextareaAutosize, {
  shouldForwardProp: (prop) => !['isEditMode'].includes(prop)
})`
  font-family: ${Fonts?.parameter || 'inherit'};
  font-size: 1.1em;
  color: ${Colors.offwhite};
  padding: 15px;
  resize: none;
  background-color: ${Colors.offblack}99;
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
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;     /* Firefox */
`;

const PromptContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isEditMode'
})`
  min-height: 130px;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: ${Colors.offblack}99;
  border: 0.5px solid ${Colors.gray2};
  transition: all 0.2s ease;
  cursor: ${props => props.isEditMode ? 'text' : 'pointer'};
  resize: vertical;
  
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
  
  /* Show scrollbar on hover for Chrome, Safari and Opera - only in edit mode */
  ${props => props.isEditMode ? `
    &:hover::-webkit-scrollbar-thumb {
      background-color: ${Colors.lime}99;
    }
  ` : ''}
  
  /* Firefox scrollbar styling */
  scrollbarWidth: ${props => props.isEditMode ? 'thin' : 'none'};
  scrollbarColor: ${props => props.isEditMode ? `${Colors.lime}60 transparent` : 'transparent transparent'};
  
  /* Show scrollbar on hover for Firefox - only in edit mode */
  ${props => props.isEditMode ? `
    &:hover {
      scrollbarWidth: thin;
      scrollbarColor: ${Colors.lime}99 transparent;
    }
  ` : ''}

  &:focus-within {
    border-color: ${Colors.lime}80;
  }
  
  &:hover {
    border-color: ${props => props.isEditMode ? Colors.lime80 : Colors.gray2};
    background-color: ${props => props.isEditMode ? Colors.offblack99 : `${Colors.offblack}BB`};
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
  // For tracking component instance
  const componentId = useRef(Math.random().toString(36).substr(2, 5));
  
  // Local states for prompt
  const [localPrompt, setLocalPrompt] = useState('');
  
  // Track the user-defined height of the prompt container
  const [promptHeight, setPromptHeight] = useState(() => {
    // Initialize from localStorage or use default on first render
    const storedHeight = localStorage.getItem('promptHeight');
    return storedHeight ? parseInt(storedHeight, 10) : 200;
  });
  
  // Figure out the current prompt based on item type and state
  const getPromptFromItem = () => {
    if (itemType === "text") {
      // For text entries, extract from messages
      if (item?.parameters?.messages) {
        const userMessage = item.parameters.messages.find(msg => msg?.role === 'user');
        return userMessage?.content || '';
      }
      return '';
    } else {
      // For images, use prompt directly
      return item?.prompt || '';
    }
  };
  
  // Use shared prompt if available (for text), otherwise use local or item prompt
  const currentPrompt = 
    (sharedPrompt !== undefined) ? sharedPrompt : 
    (localPrompt || getPromptFromItem());
  
  // Handle prompt changes
  const handlePromptChange = (newPrompt) => {
    if (setSharedPrompt) {
      setSharedPrompt(newPrompt);
    } else {
      setLocalPrompt(newPrompt);
    }
    
    if (onPromptChange) {
      onPromptChange(newPrompt);
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
  
  // Setup ResizeObserver for the prompt container
  useEffect(() => {
    const container = document.querySelector('.prompt-container');
    if (container) {
      // Start with the stored height or default
      const initialHeight = localStorage.getItem('promptHeight') 
        ? parseInt(localStorage.getItem('promptHeight'), 10) 
        : 200;
      
      // Set initial height directly
      setPromptHeight(initialHeight);
      
      // Only track manual resize events from user interactions
      let isManualResize = false;
      
      // Track mouse down on the resize handle
      const handleMouseDown = () => {
        isManualResize = true;
      };
      
      // Track mouse up to end manual resize
      const handleMouseUp = () => {
        if (isManualResize) {
          // If this was a manual resize, store the final height
          const currentHeight = container.clientHeight;
          localStorage.setItem('promptHeight', currentHeight.toString());
          setPromptHeight(currentHeight);
          isManualResize = false;
        }
      };
      
      // Only track actual manual resizes, not automatic ones
      const resizeObserver = new ResizeObserver(entries => {
        if (isManualResize) {
          for (let entry of entries) {
            const newHeight = entry.contentRect.height;
            if (newHeight > 0) {
              setPromptHeight(newHeight);
            }
          }
        }
      });
      
      // Add event listeners for resize handle interactions
      container.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Start observing
      resizeObserver.observe(container);
      
      // Clean up
      return () => {
        resizeObserver.disconnect();
        container.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, []); // Only run once on mount
  
  // Render the tooltip label
  const renderTooltipLabel = () => {
    if (React.isValidElement(promptTooltip)) {
      // If it's a JSX element, render it directly
      return <>{promptTooltip}</>;
    }
    
    if (typeof promptTooltip === 'string') {
      // If it's a string, render it as text
      return promptTooltip;
    }
    
    // Default label
    return "Prompt";
  };
  
  return (
    <Box width="100%">
      <Typography sx={LabelStyle}>
        {renderTooltipLabel()}
      </Typography>
      
      {isEditMode ? (
        <PromptContainer 
          className="prompt-container"
          isEditMode={true}
          style={{ height: `${promptHeight}px` }}
        >
          <StyledTextArea
            value={currentPrompt}
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
        </PromptContainer>
      ) : (
        <PromptContainer 
          className="prompt-container"
          isEditMode={false}
          style={{ height: `${promptHeight}px` }}
          onClick={onEditModeSwitch}
        >
          {itemType === "text" ? (
            <Box sx={{ padding: '15px' }}>
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
                {currentPrompt}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ padding: '15px' }}>
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
                {currentPrompt}
              </ReactMarkdown>
            </Box>
          )}
        </PromptContainer>
      )}
    </Box>
  );
} 