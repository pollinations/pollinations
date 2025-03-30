import React from 'react';
import { Box, Button, MenuItem, Typography, CircularProgress, Popper, Grow, Paper, MenuList, ClickAwayListener } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import { CustomTooltip } from '../CustomTooltip';
import { LLMTextManipulator } from '../LLMTextManipulator';
import { emojify, rephrase, noLink } from '../../config/llmTransforms';
import { useModels } from '../../utils/useModels';


const defaultStyles = {
  // Main component colors
  backgroundColor: "transparent",
  textColor: Colors.offwhite,
  borderColor: Colors.gray2,
  borderColorHover: Colors.lime,
  labelColor: Colors.offwhite,
  
  // Menu dropdown colors
  menuBackgroundColor: Colors.offblack,
  menuHoverBackgroundColor: `${Colors.gray2}99`,
  menuHoverTextColor: Colors.offwhite,
  secondaryTextColor: `${Colors.lime}99`,
  
  // Scrollbar colors
  scrollbarColor: `${Colors.lime}99`,
  scrollbarHoverColor: Colors.lime,
  scrollbarTrackColor: Colors.offblack,
  
  // Button state colors
  buttonHoverColor: Colors.offblack,
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
    fontSize: { xs: '1.2em', md: '1.1em' },
  },
});

// Menu items hover style
const getMenuItemHover = (styles) => ({
  '&:hover': {
    backgroundColor: styles.menuHoverBackgroundColor,
    color: styles.menuHoverTextColor,
  },
});

// Menu item shared styles - extract to a constant for reuse
const getMenuItemStyles = (styles) => ({
  color: styles.textColor,
  backgroundColor: styles.menuBackgroundColor,
  fontFamily: Fonts.parameter,
  fontSize: '1.1em',
  padding: '10px 16px',
  minHeight: '44px',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: '1.4',
  ...getMenuItemHover(styles),
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
      // Return the model name as is
      return foundModel.name;
    }
    
    // Fallback to ID
    return currentModel;
  };
  
  // Format the display name for the button
  const renderDisplayName = () => {
    const displayName = getDisplayName();
    
    if (displayName.includes('(')) {
      return (
        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Typography component="span" sx={{ fontWeight: 'bold' }}>
            {displayName.split('(')[0].trim()}
          </Typography>
          <Typography component="span" sx={{ color: mergedStyles.secondaryTextColor }}>
            {' '}({displayName.split('(')[1]}
          </Typography>
        </Box>
      );
    }
    
    return displayName;
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
              backgroundColor: mergedStyles.buttonHoverColor,
            },
            "&:active": {
              backgroundColor: mergedStyles.buttonHoverColor,
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
          {modelsLoading ? "Loading models..." : renderDisplayName()}
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
                backgroundColor: mergedStyles.menuBackgroundColor,
                maxHeight: '300px',
                minWidth: anchorRef.current ? anchorRef.current.offsetWidth : '200px',
                width: 'auto',
                maxWidth: '500px',
                overflowY: 'auto',
                overflowX: 'hidden',
                '&::-webkit-scrollbar': {
                  width: '6px',
                  backgroundColor: mergedStyles.scrollbarTrackColor,
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: mergedStyles.scrollbarTrackColor,
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: mergedStyles.scrollbarColor,
                  borderRadius: '0',
                  border: 'none',
                  '&:hover': {
                    backgroundColor: mergedStyles.scrollbarHoverColor,
                  },
                },
                scrollbarWidth: 'medium',
                scrollbarColor: `${mergedStyles.scrollbarColor} ${mergedStyles.scrollbarTrackColor}`,
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
                    backgroundColor: mergedStyles.menuBackgroundColor,
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
                        {modelOption.name.includes('(') ? (
                          <Box>
                            <Typography component="span" sx={{ fontWeight: 'bold' }}>
                              {modelOption.name.split('(')[0].trim()}
                            </Typography>
                            <Typography component="span" sx={{ color: mergedStyles.secondaryTextColor }}>
                              {' '}({modelOption.name.split('(')[1]}
                            </Typography>
                          </Box>
                        ) : (
                          modelOption.name
                        )}
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