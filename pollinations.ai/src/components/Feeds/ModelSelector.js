import React from 'react';
import { Box, Button, Menu, MenuItem, Typography, CircularProgress } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import { CustomTooltip } from '../CustomTooltip';
import { LLMTextManipulator } from '../LLMTextManipulator';
import { emojify, rephrase, noLink } from '../../config/llmTransforms';
import { useTextModels } from '../../utils/useTextModels';

// Styling constants
const labelColor = `${Colors.offwhite}99`;
const labelFont = Fonts.parameter;
const labelSize = '1em';
const paramTextColor = Colors.offwhite;
const paramTextSize = { xs: '1.5em', md: '1.1em' };
const paramBorderColor = Colors.gray2;

// Typography style for label
const typographyStyles = {
  label: {
    color: labelColor,
    fontSize: labelSize,
    fontFamily: labelFont,
  },
};

// Button style for model selector
const buttonStyles = {
  base: {
    color: Colors.offwhite,
    width: '100%',
    justifyContent: 'flex-start',
    height: '60px',
    border: 'none',
  },
  responsiveFontSize: {
    fontSize: paramTextSize,
  },
};

// Menu items hover style
const menuItemHover = {
  '&:hover': {
    backgroundColor: Colors.offwhite,
    color: Colors.offblack,
  },
};

// Menu item shared styles - extract to a constant for reuse
const menuItemStyles = {
  color: paramTextColor,
  backgroundColor: Colors.offblack,
  fontFamily: Fonts.parameter,
  fontSize: '1.1em',
  padding: '10px 16px',
  minHeight: '44px',
  ...menuItemHover,
};

/**
 * Shared ModelSelector component for both image and text feeds
 * Uses a unified UI dropdown pattern for both types
 * 
 * @param {Object} props
 * @param {string} props.itemType - "image" or "text"
 * @param {string} props.currentModel - Currently selected model
 * @param {function} props.onModelChange - Callback when model changes
 * @param {boolean} props.isLoading - Whether the parent component is loading
 * @param {function} props.onFocus - Callback when component gets focus
 * @param {string} props.tooltipText - Text for the tooltip
 * @param {function} props.setIsInputChanged - Function to set input changed state
 * @param {Object} props.buttonProps - Additional props for button
 * @param {Array} props.availableModels - Array of available models (for image)
 */
export function ModelSelector({
  itemType = 'text',
  currentModel,
  onModelChange,
  isLoading = false,
  onFocus,
  tooltipText,
  setIsInputChanged,
  buttonProps = {},
  availableModels = []
}) {
  // Menu anchor state (shared)
  const [anchorEl, setAnchorEl] = React.useState(null);
  
  // For text models, load from API
  const { models, loading: modelsLoading, error: modelsError } = useTextModels();
  
  // Handle menu open (shared)
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  // Handle menu close and selection (shared)
  const handleMenuClose = (value) => {
    setAnchorEl(null);
    if (value) {
      onModelChange(value);
      if (setIsInputChanged) {
        setIsInputChanged(true);
      }
    }
  };
  
  // Get appropriate models based on itemType
  const getModels = () => {
    if (itemType === 'image') {
      return availableModels.length > 0 ? availableModels : [];
    } else {
      return models || [];
    }
  };
  
  // Get display name for current model
  const getDisplayName = () => {
    if (itemType === 'image') {
      return currentModel || (availableModels.length > 0 ? availableModels[0] : "");
    } else {
      // For text models, find the matching name
      if (!currentModel) return "";
      
      const foundModel = models?.find(m => m.id === currentModel);
      if (foundModel) {
        return foundModel.name;
      }
      
      // Fallback to ID with capitalization
      return currentModel.charAt(0).toUpperCase() + currentModel.slice(1);
    }
  };
  
  // Format the display name consistently
  const formatDisplayName = (name) => {
    if (!name) return "";
    
    // Ensure consistent capitalization
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    
    // Truncate if too long (for UI consistency)
    return displayName.length > 20 ? displayName.substring(0, 18) + '...' : displayName;
  };
  
  // Get available models
  const availableModelsList = getModels();
  
  // If no models are available, don't display anything
  if ((itemType === 'image' && availableModelsList.length === 0) || 
      (itemType === 'text' && availableModelsList.length === 0 && !modelsLoading && modelsError)) {
    return null;
  }
  
  // Tooltip component based on tooltip text
  const tooltipComponent = tooltipText ? (
    <CustomTooltip
      title={<LLMTextManipulator text={tooltipText} transforms={[rephrase, emojify, noLink]} />}
      interactive
    >
      <Typography component="div" variant="body" sx={typographyStyles.label}>
        Model
      </Typography>
    </CustomTooltip>
  ) : (
    <Typography sx={typographyStyles.label}>Model</Typography>
  );
  
  // Render button with models in dropdown menu
  return (
    <Box>
      {tooltipComponent}
      <Box
        sx={{
          border: `0.5px solid ${paramBorderColor}`,
          height: "60px",
          transition: "border-color 0.2s ease",
          "&:hover": {
            borderColor: Colors.lime,
          },
          "&:focus-within": {
            borderColor: Colors.lime,
          }
        }}
      >
        <Button
          variant="outlined"
          aria-controls="model-menu"
          aria-haspopup="true"
          onClick={handleMenuOpen}
          onFocus={onFocus}
          disabled={isLoading || modelsLoading}
          sx={{
            ...buttonStyles.base,
            ...buttonStyles.responsiveFontSize,
            borderRadius: "0px",
            height: "60px",
            fontFamily: Fonts.parameter,
            fontSize: paramTextSize,
            backgroundColor: "transparent",
            textTransform: "none", // Prevent auto-uppercase,
            "&:hover": {
              backgroundColor: "transparent",
            },
            ...buttonProps
          }}
        >
          {modelsLoading ? "Loading models..." : formatDisplayName(getDisplayName())}
        </Button>
      </Box>
      <Menu
        id="model-menu"
        anchorEl={anchorEl}
        keepMounted
        open={Boolean(anchorEl)}
        onClose={() => handleMenuClose(null)}
        MenuListProps={{
          sx: {
            textAlign: "left",
            backgroundColor: "transparent",
            fontFamily: Fonts.parameter,
          },
        }}
        PaperProps={{
          sx: {
            backgroundColor: Colors.offblack,
            boxShadow: `0px 5px 10px rgba(0, 0, 0, 0.5)`,
            maxHeight: '300px',
            overflowY: 'auto',
            // Hide scrollbar but show handle
            '&::-webkit-scrollbar': {
              width: '6px',
              backgroundColor: 'transparent',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: `${Colors.lime}99`,
              borderRadius: '3px',
              '&:hover': {
                backgroundColor: Colors.lime,
              },
            },
            // Firefox scrollbar styling
            scrollbarWidth: 'thin',
            scrollbarColor: `${Colors.lime}99 transparent`,
          }
        }}
      >
        {modelsLoading ? (
          <MenuItem disabled>
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={16} />
              <span>Loading models...</span>
            </Box>
          </MenuItem>
        ) : itemType === 'image' ? (
          // Image models
          availableModelsList.map((modelName) => (
            <MenuItem
              key={modelName}
              onClick={() => handleMenuClose(modelName)}
              sx={menuItemStyles}
            >
              {formatDisplayName(modelName)}
            </MenuItem>
          ))
        ) : (
          // Text models
          availableModelsList.map(modelOption => (
            <MenuItem
              key={modelOption.id}
              onClick={() => handleMenuClose(modelOption.id)}
              sx={menuItemStyles}
            >
              {formatDisplayName(modelOption.name)}
            </MenuItem>
          ))
        )}
      </Menu>
    </Box>
  );
} 