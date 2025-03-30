import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { Colors, Fonts } from "../config/global";
import { GeneralButton } from "./GeneralButton";
import { trackEvent } from "../config/analytics";
import { useMediaQuery, useTheme } from "@mui/material";

/**
 * A reusable component for displaying tab buttons with a flexible layout
 * where each button takes just the width it needs.
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of tab items to display
 * @param {string} props.selectedKey - The currently selected tab key
 * @param {Function} props.onSelectTab - Callback when a tab is selected, receives item key
 * @param {string} props.trackingCategory - Category for analytics tracking
 * @param {string} props.trackingAction - Action for analytics tracking
 * @param {Function} props.getButtonBackground - Optional function to get background color for a tab
 * @param {Function} props.getButtonTextColor - Optional function to get text color for a tab
 * @param {Object} props.buttonStyle - Additional style overrides for all buttons
 */
const TabSelector = ({
  items = [],
  selectedKey,
  onSelectTab,
  trackingCategory = "tab",
  trackingAction = "select_tab",
  getButtonBackground,
  getButtonTextColor,
  buttonStyle = {},
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));
  
  // Internal state to track selection when parent doesn't provide one
  const [internalSelectedKey, setInternalSelectedKey] = useState(
    selectedKey || (items.length > 0 ? (items[0].key || items[0]) : null)
  );
  
  // Use parent selection if provided, otherwise use internal selection
  const effectiveSelectedKey = selectedKey || internalSelectedKey;

  // Update internal selection when items change and no selection exists
  useEffect(() => {
    if (items.length > 0 && !effectiveSelectedKey) {
      const firstItemKey = items[0].key || items[0];
      setInternalSelectedKey(firstItemKey);
      onSelectTab(firstItemKey);
    }
  }, [items, effectiveSelectedKey, onSelectTab]);

  // Default background color function if none provided
  const defaultGetButtonBackground = (itemKey) => {
    return effectiveSelectedKey === itemKey ? Colors.lime : Colors.offblack2;
  };

  // Default text color function if none provided
  const defaultGetButtonTextColor = (itemKey) => {
    return effectiveSelectedKey === itemKey ? Colors.offblack : Colors.lime;
  };

  // Use provided functions or defaults
  const getBgColor = getButtonBackground || defaultGetButtonBackground;
  const getTextColor = getButtonTextColor || defaultGetButtonTextColor;

  const handleTabClick = (itemKey) => {
    setInternalSelectedKey(itemKey);
    onSelectTab(itemKey);
    trackEvent({
      action: trackingAction,
      category: trackingCategory,
      value: itemKey,
    });
  };

  return (
    <Box sx={{ 
      maxWidth: "1000px", 
      width: "100%", 
      marginLeft: "auto", 
      marginRight: "auto", 
      marginBottom: "2em",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "10px"
    }}>
      {items.map((item) => (
        <GeneralButton
          key={item.key || item}
          handleClick={() => handleTabClick(item.key || item)}
          backgroundColor={getBgColor(item.key || item)}
          textColor={getTextColor(item.key || item)}
          style={{
            minWidth: isMobile ? "100px" : "120px",
            fontFamily: Fonts.title,
            fontWeight: 600,
            fontSize: isMobile ? "1.3rem" : isTablet ? "1.4rem" : "1.5rem",
            boxShadow: effectiveSelectedKey === (item.key || item) ? "0 4px 8px rgba(0,0,0,0.2)" : "none",
            transform: effectiveSelectedKey === (item.key || item) ? "translateY(-2px)" : "none",
            transition: "all 0.3s ease",
            padding: isMobile ? "0.4rem 0.8rem" : "0.75rem 1.2rem",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: isMobile ? 1 : 0,
            ...buttonStyle,
          }}
        >
          {item.title || item}
        </GeneralButton>
      ))}
    </Box>
  );
};

export default TabSelector; 