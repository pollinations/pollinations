import React from "react";
import {
    Box,
    Button,
    MenuItem,
    Typography,
    CircularProgress,
    Popper,
    Grow,
    Paper,
    MenuList,
    ClickAwayListener,
} from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { CustomTooltip } from "../CustomTooltip";
import { LLMTextManipulator } from "../LLMTextManipulator";
import { emojify, rephrase, noLink } from "../../config/llmTransforms";
import { useModels } from "../../utils/useModels.js";

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
 * @param {Object} props.buttonProps - Additional props for button positioning or dimensions
 * @param {Object} props.layoutProps - Layout props like width, position, etc.
 */
export function ModelSelector({
    itemType = "text",
    currentModel,
    onModelChange,
    isLoading = false,
    onFocus,
    tooltipText,
    setIsInputChanged,
    buttonProps = {},
    layoutProps = {},
}) {
    // Menu state
    const [open, setOpen] = React.useState(false);
    const anchorRef = React.useRef(null);

    // For models, load from API based on itemType
    const {
        models,
        loading: modelsLoading,
        error: modelsError,
    } = useModels(itemType);

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
        if (event.key === "Tab") {
            event.preventDefault();
            setOpen(false);
        } else if (event.key === "Escape") {
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
        const foundModel = models?.find((m) => m.id === currentModel);
        if (foundModel) {
            return foundModel.name;
        }
        return currentModel;
    };

    // Format the display name for the button
    const renderDisplayName = () => {
        const displayName = getDisplayName();

        if (displayName.includes("(")) {
            return (
                <Box
                    sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    <Typography component="span" sx={{ fontWeight: "bold" }}>
                        {displayName.split("(")[0].trim()}
                    </Typography>
                    <Typography
                        component="span"
                        sx={{ color: `${Colors.offblack}99` }}
                    >
                        {" "}
                        ({displayName.split("(")[1]}
                    </Typography>
                </Box>
            );
        }
        return displayName;
    };

    // Tooltip component based on tooltip text
    const tooltipComponent = tooltipText
        ? <CustomTooltip
              title={
                  <LLMTextManipulator
                      text={tooltipText}
                      transforms={[rephrase, emojify, noLink]}
                  />
              }
              interactive
          >
              <Typography
                  sx={{
                      color: Colors.gray2,
                      fontSize: "0.9em",
                      fontFamily: Fonts.parameter,
                  }}
              >
                  Model
              </Typography>
          </CustomTooltip>
        : <Typography
              sx={{
                  color: Colors.gray2,
                  fontSize: "0.9em",
                  fontFamily: Fonts.parameter,
              }}
          >
              Model
          </Typography>;

    return (
        <Box {...layoutProps}>
            {tooltipComponent}
            <Box
                sx={{
                    border: `0px solid ${Colors.gray2}`,
                    borderRadius: "0em",
                    height: "60px",
                    transition: "border-color 0.2s ease",
                    backgroundColor: Colors.offblack2,
                    "&:hover": {
                        borderColor: Colors.lime,
                        border: `0px solid ${Colors.lime}`,
                    },
                    "&:focus-within": {
                        borderColor: Colors.lime,
                        border: `0px solid ${Colors.lime}`,
                    },
                    position: "relative",
                    zIndex: 0,
                    overflow: "hidden",
                }}
            >
                <Button
                    ref={anchorRef}
                    variant="outlined"
                    aria-controls={open ? "model-menu-list" : undefined}
                    aria-expanded={open ? "true" : undefined}
                    aria-haspopup="true"
                    onClick={handleToggle}
                    onFocus={onFocus}
                    disabled={isLoading || modelsLoading}
                    disableRipple={true}
                    sx={{
                        color: Colors.offwhite,
                        width: "100%",
                        justifyContent: "flex-start",
                        height: "60px",
                        border: "none",
                        borderRadius: "0px",
                        height: "56px",
                        margin: "2px",
                        width: "calc(100% - 4px)",
                        fontFamily: Fonts.parameter,
                        textTransform: "none",
                        border: "none",
                        boxShadow: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        paddingLeft: "12px",
                        paddingRight: "12px",
                        fontSize: { xs: "1.2em", md: "1.1em" },
                        "&:hover": {
                            backgroundColor: "transparent",
                        },
                        ...buttonProps,
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
                    zIndex: 1300,
                }}
            >
                {({ TransitionProps, placement }) => (
                    <Grow
                        {...TransitionProps}
                        style={{
                            transformOrigin:
                                placement === "bottom-start"
                                    ? "left top"
                                    : "left bottom",
                        }}
                    >
                        <Paper
                            sx={{
                                maxHeight: "300px",
                                minWidth: anchorRef.current
                                    ? anchorRef.current.offsetWidth
                                    : "200px",
                                width: "auto",
                                maxWidth: "500px",
                                overflowY: "auto",
                                overflowX: "hidden",
                                elevation: 0,
                                boxShadow: "none",
                                /* Hide scrollbar for Chrome, Safari and Opera */
                                "&::-webkit-scrollbar": {
                                    width: "20px",
                                    background: "transparent",
                                },
                                "&::-webkit-scrollbar-thumb": {
                                    backgroundColor: "transparent",
                                },
                                /* Show scrollbar on hover for Chrome, Safari and Opera */
                                "&:hover::-webkit-scrollbar-thumb": {
                                    backgroundColor: `${Colors.lime}60`,
                                    borderRadius: "0px",
                                },
                                /* Hide scrollbar for IE, Edge and Firefox */
                                msOverflowStyle: "none" /* IE and Edge */,
                                scrollbarWidth: "none" /* Firefox */,
                                /* Show scrollbar on hover for Firefox */
                                "&:hover": {
                                    scrollbarWidth: "thin",
                                    scrollbarColor: `${Colors.lime}60 transparent`,
                                    borderColor: `${Colors.lime}`,
                                },
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
                                        backgroundColor: Colors.offblack2,
                                        fontFamily: Fonts.parameter,
                                        padding: "8px",
                                    }}
                                >
                                    {modelsLoading
                                        ? <MenuItem disabled>
                                              <Box
                                                  display="flex"
                                                  alignItems="center"
                                                  gap={1}
                                              >
                                                  <CircularProgress size={16} />
                                                  <span>Loading models...</span>
                                              </Box>
                                          </MenuItem>
                                        : availableModelsList.length > 0
                                          ? availableModelsList.map(
                                                (modelOption) => (
                                                    <MenuItem
                                                        key={modelOption.id}
                                                        onClick={handleMenuItemClick(
                                                            modelOption.id,
                                                        )}
                                                        disableRipple={true}
                                                        sx={{
                                                            color: Colors.offwhite,
                                                            backgroundColor:
                                                                Colors.offblack2,
                                                            fontFamily:
                                                                Fonts.parameter,
                                                            fontSize: "1.1em",
                                                            padding:
                                                                "10px 16px",
                                                            minHeight: "44px",
                                                            whiteSpace:
                                                                "normal",
                                                            wordBreak:
                                                                "break-word",
                                                            lineHeight: "1.4",
                                                            "&:hover": {
                                                                backgroundColor:
                                                                    Colors.lime,
                                                                color: Colors.offblack,
                                                            },
                                                        }}
                                                    >
                                                        {modelOption.name.includes(
                                                            "(",
                                                        )
                                                            ? <Box>
                                                                  <Typography
                                                                      component="span"
                                                                      sx={{
                                                                          fontWeight:
                                                                              "bold",
                                                                      }}
                                                                  >
                                                                      {modelOption.name
                                                                          .split(
                                                                              "(",
                                                                          )[0]
                                                                          .trim()}
                                                                  </Typography>
                                                                  <Typography
                                                                      component="span"
                                                                      sx={{
                                                                          color: `${Colors.gray2}`,
                                                                      }}
                                                                  >
                                                                      {" "}
                                                                      (
                                                                      {
                                                                          modelOption.name.split(
                                                                              "(",
                                                                          )[1]
                                                                      }
                                                                  </Typography>
                                                              </Box>
                                                            : modelOption.name}
                                                    </MenuItem>
                                                ),
                                            )
                                          : <MenuItem
                                                disabled
                                                sx={{
                                                    color: Colors.offwhite,
                                                    backgroundColor:
                                                        Colors.offblack,
                                                    fontFamily: Fonts.parameter,
                                                    fontSize: "1.1em",
                                                    padding: "10px 16px",
                                                    minHeight: "44px",
                                                }}
                                            >
                                                No models available
                                            </MenuItem>}
                                </MenuList>
                            </ClickAwayListener>
                        </Paper>
                    </Grow>
                )}
            </Popper>
        </Box>
    );
}
