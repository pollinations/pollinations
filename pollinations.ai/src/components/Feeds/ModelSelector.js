import React from 'react';
import { Box, Button, MenuItem, Typography, CircularProgress, Popper, Grow, Paper, MenuList, ClickAwayListener } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import { CustomTooltip } from '../CustomTooltip';
import { LLMTextManipulator } from '../LLMTextManipulator';
import { emojify, rephrase, noLink } from '../../config/llmTransforms';
import { useModels } from '../../utils/useModels';

// Default styling constants
const defaultStyles = {
  backgroundColor: "transparent",
  textColor: Colors.offwhite,
  borderColor: Colors.gray2,
  borderColorHover: Colors.lime,
  labelColor: `${Colors.offwhite}99`,
}

// Typography style for label
const getTypographyStyles = (styles) => ({
  label: {
    color: styles.labelColor,
    fontSize: '1em',
    fontFamily: Fonts.parameter,
  },
});

// Button style for model selector
const getButtonStyles = (styles) => ({
  base: {
    color: styles.textColor,
    width: '100%',
    justifyContent: 'flex-start',
    height: '60px',
    border: 'none',
  },
  responsiveFontSize: {
    fontSize: { xs: '1.5em', md: '1.1em' },
  },
});

// Menu items hover style
const menuItemHover = {
  '&:hover': {
    backgroundColor: Colors.offwhite,
    color: Colors.offblack,
  },
};

// Menu item shared styles - extract to a constant for reuse
const getMenuItemStyles = (styles) => ({
  color: styles.textColor,
  backgroundColor: Colors.offblack2,
  fontFamily: Fonts.parameter,
  fontSize: '1.1em',
  padding: '10px 16px',
  minHeight: '44px',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: '1.4',
  ...menuItemHover,
});

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
 * @param {Object} props.styles - Custom styling properties
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
  styles = {}
}) {
  // Merge default styles with custom styles
  const mergedStyles = { ...defaultStyles, ...styles }
  
  // Get styled component props
  const typographyStyles = getTypographyStyles(mergedStyles);
  const buttonStyles = getButtonStyles(mergedStyles);
  const menuItemStyles = getMenuItemStyles(mergedStyles);

  // Menu state
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  
  // For models, load from API based on itemType
  const { models, loading: modelsLoading, error: modelsError } = useModels(itemType);
  
  // Handle toggle
  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  // Handle close
  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }

    setOpen(false);
  };

  // Handle menu item click
  const handleMenuItemClick = (value) => (event) => {
    onModelChange(value);
    if (setIsInputChanged) {
      setIsInputChanged(true);
    }
    handleClose(event);
  };
  
  // Handle key events for accessibility
  const handleListKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  // Return focus to the button when the menu closes
  const prevOpen = React.useRef(open);
  React.useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current.focus();
    }

    prevOpen.current = open;
  }, [open]);
  
  // Get available models
  const availableModelsList = models || [];
  
  // Get display name for current model
  const getDisplayName = () => {
    if (!currentModel) return "";
    
    const foundModel = models?.find(m => m.id === currentModel);
    if (foundModel) {
      return foundModel.name;
    }
    
    // Fallback to ID
    return currentModel;
  };
  
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
          border: `0.5px solid ${mergedStyles.borderColor}`,
          height: "60px",
          transition: "border-color 0.2s ease",
          backgroundColor: mergedStyles.backgroundColor,
          "&:hover": {
            borderColor: mergedStyles.borderColorHover,
            border: `1px solid ${mergedStyles.borderColorHover}`,
          },
          "&:focus-within": {
            borderColor: mergedStyles.borderColorHover,
            border: `1px solid ${mergedStyles.borderColorHover}`,
          },
          // Ensure all borders are visible
          position: "relative",
          zIndex: 0,
          overflow: "hidden"
        }}
      >
        <Button
          ref={anchorRef}
          variant="outlined"
          aria-controls={open ? 'model-menu-list' : undefined}
          aria-expanded={open ? 'true' : undefined}
          aria-haspopup="true"
          onClick={handleToggle}
          onFocus={onFocus}
          disabled={isLoading || modelsLoading}
          disableRipple={true}
          sx={{
            ...buttonStyles.base,
            ...buttonStyles.responsiveFontSize,
            borderRadius: "0px",
            height: "56px",
            margin: "2px",
            width: "calc(100% - 4px)",
            fontFamily: Fonts.parameter,
            textTransform: "none",
            "&:hover": {
              backgroundColor: Colors.offblack,
            },
            "&:active": {
              backgroundColor: Colors.offblack,
            },
            border: "none",
            boxShadow: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: "12px",
            paddingRight: "12px",
            ...buttonProps
          }}
        >
          {modelsLoading ? "Loading models..." : getDisplayName()}
        </Button>
      </Box>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        placement="bottom-start"
        transition
        disablePortal
        style={{
          zIndex: 1300
        }}
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === 'bottom-start' ? 'left top' : 'left bottom',
            }}
          >
            <Paper
              sx={{
                backgroundColor: Colors.offblack,
                maxHeight: '300px',
                minWidth: anchorRef.current ? anchorRef.current.offsetWidth : '200px',
                width: 'auto',
                maxWidth: '500px',
                overflowY: 'auto',
                overflowX: 'hidden',
                '&::-webkit-scrollbar': {
                  width: '6px',
                  backgroundColor: Colors.offblack2,
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: Colors.offblack2,
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: `${Colors.lime}99`,
                  borderRadius: '0',
                  border: 'none',
                  '&:hover': {
                    backgroundColor: Colors.lime,
                  },
                },
                scrollbarWidth: 'medium',
                scrollbarColor: `${Colors.lime}99 ${Colors.offblack2}`,
                elevation: 0,
                boxShadow: 'none',
                border: 'none',
              }}
            >
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList
                  autoFocusItem={open}
                  id="model-menu-list"
                  aria-labelledby="model-button"
                  onKeyDown={handleListKeyDown}
                  sx={{
                    textAlign: "left",
                    backgroundColor: Colors.offblack,
                    fontFamily: Fonts.parameter,
                    padding: "8px",
                  }}
                >
                  {modelsLoading ? (
                    <MenuItem disabled>
                      <Box display="flex" alignItems="center" gap={1}>
                        <CircularProgress size={16} />
                        <span>Loading models...</span>
                      </Box>
                    </MenuItem>
                  ) : availableModelsList.length > 0 ? (
                    // Display available models from the API
                    availableModelsList.map(modelOption => (
                      <MenuItem
                        key={modelOption.id}
                        onClick={handleMenuItemClick(modelOption.id)}
                        disableRipple={true}
                        sx={menuItemStyles}
                      >
                        {modelOption.name}
                      </MenuItem>
                    ))
                  ) : (
                    // No models available
                    <MenuItem disabled sx={menuItemStyles}>
                      No models available
                    </MenuItem>
                  )}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </Box>
  );
} 