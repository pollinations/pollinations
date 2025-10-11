import React, { useEffect, useState, useMemo } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { Colors, Fonts } from "../config/global";
import { GeneralButton } from "./GeneralButton";
import { trackEvent } from "../config/analytics";

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

    // Helper to get item key consistently
    const getItemKey = (item) => item.key || item;

    // Initialize with first item if items exist and no selection provided
    const defaultKey = items.length > 0 ? getItemKey(items[0]) : null;

    // Internal state to track selection when parent doesn't provide one
    const [internalSelectedKey, setInternalSelectedKey] = useState(
        selectedKey || defaultKey,
    );

    // Use parent selection if provided, otherwise use internal selection
    const effectiveSelectedKey = selectedKey || internalSelectedKey;

    // Update internal selection when items change and no selection exists
    useEffect(() => {
        if (items.length > 0 && !effectiveSelectedKey) {
            const firstItemKey = getItemKey(items[0]);
            setInternalSelectedKey(firstItemKey);
            onSelectTab?.(firstItemKey);
        }
    }, [items, effectiveSelectedKey, onSelectTab]);

    // Style functions with defaults
    const getBgColor = useMemo(
        () =>
            getButtonBackground ||
            ((itemKey) =>
                effectiveSelectedKey === itemKey
                    ? Colors.lime
                    : Colors.offblack2),
        [getButtonBackground, effectiveSelectedKey],
    );

    const getTextColor = useMemo(
        () =>
            getButtonTextColor ||
            ((itemKey) =>
                effectiveSelectedKey === itemKey
                    ? Colors.offblack
                    : Colors.lime),
        [getButtonTextColor, effectiveSelectedKey],
    );

    const handleTabClick = (itemKey) => {
        setInternalSelectedKey(itemKey);
        onSelectTab?.(itemKey);
        trackEvent({
            action: trackingAction,
            category: trackingCategory,
            value: itemKey,
        });
    };

    // Extract commonly used styles
    const containerStyle = {
        maxWidth: "1000px",
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
        marginBottom: "2em",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "10px",
    };

    const getButtonStyles = (itemKey) => {
        const isSelected = effectiveSelectedKey === itemKey;

        return {
            minWidth: isMobile ? "100px" : "120px",
            fontFamily: Fonts.title,
            fontWeight: 600,
            fontSize: isMobile ? "1.3rem" : isTablet ? "1.4rem" : "1.5rem",
            boxShadow: isSelected ? "0 4px 8px rgba(0,0,0,0.2)" : "none",
            transform: isSelected ? "translateY(-2px)" : "none",
            transition: "all 0.3s ease",
            padding: isMobile ? "0.4rem 0.8rem" : "0.75rem 1.2rem",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: isMobile ? 1 : 0,
            ...buttonStyle,
        };
    };

    return (
        <Box sx={containerStyle}>
            {items.map((item) => {
                const itemKey = getItemKey(item);
                return (
                    <GeneralButton
                        key={itemKey}
                        handleClick={() => handleTabClick(itemKey)}
                        backgroundColor={getBgColor(itemKey)}
                        textColor={getTextColor(itemKey)}
                        style={getButtonStyles(itemKey)}
                    >
                        {item.title || item}
                    </GeneralButton>
                );
            })}
        </Box>
    );
};

export default TabSelector;
