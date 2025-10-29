import React, { useState, useEffect, useRef } from "react";
import { Typography, Box } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { keyframes } from "@emotion/react";

/**
 * Shared ServerLoadInfo component for both image and text feeds
 * This component continues to display and update counters regardless of edit mode
 *
 * @param {Object} props
 * @param {Object} props.lastItem - Last received item (image or text entry)
 * @param {number} props.itemsGenerated - Count of items generated from the parent feed
 * @param {Object} props.currentItem - Current displayed item
 * @param {string} props.itemType - Type of item ("image" or "text")
 */
export function ServerLoadInfo({
    lastItem,
    itemsGenerated,
    currentItem,
    itemType,
}) {
    // Simulate load when concurrentRequests is not available
    const [simulatedLoad, setSimulatedLoad] = useState(2);
    // Add state to track if component is ready to display
    const [isReady, setIsReady] = useState(false);

    // State and Refs for event-based rate calculation
    const [imagesPerSecond, setImagesPerSecond] = useState(0);
    const eventsSinceLastCalcRef = useRef(0);
    const lastRateCalcTimeRef = useRef(Date.now());

    // Set ready state after a short delay
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 500); // 500ms delay

        return () => clearTimeout(timer);
    }, []);

    // Modified: Effect for rate calculation now ONLY needs to handle events for rate, not local count
    useEffect(() => {
        const handleItemReceivedForRate = () => {
            eventsSinceLastCalcRef.current += 1;
        };

        window.addEventListener("image-received", handleItemReceivedForRate);
        window.addEventListener(
            "text-entry-received",
            handleItemReceivedForRate,
        );

        const intervalId = setInterval(() => {
            const now = Date.now();
            const timeDiffSeconds = (now - lastRateCalcTimeRef.current) / 1000;
            const eventCount = eventsSinceLastCalcRef.current;

            if (timeDiffSeconds >= 1.95) {
                // Update roughly every 2 seconds (changed from 0.95)
                const currentRate = eventCount / timeDiffSeconds;
                setImagesPerSecond(currentRate.toFixed(1)); // Changed back to .toFixed(1)

                // Reset for next interval
                eventsSinceLastCalcRef.current = 0;
                lastRateCalcTimeRef.current = now;
            }
        }, 1000); // Check every 1000ms

        return () => {
            clearInterval(intervalId); // Clear interval on unmount
            window.removeEventListener(
                "image-received",
                handleItemReceivedForRate,
            );
            window.removeEventListener(
                "text-entry-received",
                handleItemReceivedForRate,
            );
        };
    }, []); // Empty dependency array: runs once on mount

    // Update simulated load periodically
    useEffect(() => {
        // Vary between 1 and 4 for the simulated load
        const updateSimulatedLoad = () => {
            // Base load on current time and a "random-like" calculation
            const now = Date.now();
            const variableFactor = Math.sin(now / 10000) * 2 + 2; // Oscillates between 0 and 4
            setSimulatedLoad(
                Math.max(1, Math.min(4, Math.round(variableFactor))),
            );
        };

        // Update every 5 seconds
        const intervalId = setInterval(updateSimulatedLoad, 5000);
        updateSimulatedLoad(); // Initial update

        return () => clearInterval(intervalId);
    }, []);

    // Don't render until ready
    if (!isReady) {
        return null;
    }

    // Always use itemsGenerated from props. Default to 0 if undefined/null.
    const displayCount =
        itemsGenerated !== undefined && itemsGenerated !== null
            ? itemsGenerated
            : 0;
    // Calculate safeRequests here to pass to RateDisplay
    const safeRequests =
        lastItem?.concurrentRequests !== undefined &&
        lastItem?.concurrentRequests !== null
            ? lastItem.concurrentRequests
            : simulatedLoad;

    return (
        <Box
            display="flex"
            flexDirection={{ xs: "row", sm: "row" }}
            justifyContent="center"
            alignItems="center"
            style={{ gap: "4em" }}
            sx={{
                color: Colors.offwhite,
                fontSize: "1.em",
                flexWrap: "wrap", // Allow wrapping on smaller screens
            }}
        >
            <CountBadge itemsGenerated={displayCount} />
            <RateDisplay rate={imagesPerSecond} itemType={itemType} />
            {/* <TimingInfo item={lastItem} /> */}
        </Box>
    );
}

function CountBadge({ itemsGenerated }) {
    // Ensure we always have a number, defaulting to 0 if undefined
    const safeItemCount =
        itemsGenerated !== undefined && itemsGenerated !== null
            ? itemsGenerated
            : 0;
    const formattedCount = formatNumberWithCommas(safeItemCount);

    // Removed blinking animation keyframes and glow effect as per issue #1793

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
            }}
        >
            <Typography
                component="div"
                sx={{
                    color: Colors.gray2,
                    fontSize: { xs: "1.2em", sm: "1.5em" },
                    fontFamily: Fonts.headline,
                    fontWeight: 500,
                }}
            >
                Count #
            </Typography>

            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                }}
            >
                <Box
                    sx={{
                        backgroundColor: "transparent",
                        color: Colors.lime,
                        fontWeight: "bold",
                        fontFamily: Fonts.headline,
                        fontSize: { xs: "1.5em", sm: "2.5em" },
                        height: "50px",
                        borderRadius: "36px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.3s ease",
                    }}
                >
                    <span>{formattedCount}</span>
                </Box>
            </Box>
        </Box>
    );
}

function TimingInfo({ item }) {
    const timeMs = item?.generationTime || item?.timingInfo?.[5]?.timestamp;
    return (
        <Typography variant="body" component="i" style={{ fontSize: "1.2em" }}>
            Generation time:
            <span style={{ color: Colors.lime }}>
                <b> {Math.round(timeMs / 100) / 10} s</b>
            </span>
        </Typography>
    );
}

// Updated RateDisplay component to include load bars
function RateDisplay({ rate, itemType }) {
    // Multiply rate by 5 as per issue #1793
    const adjustedRate = rate ? (parseFloat(rate) * 5).toFixed(1) : "0.0";
    const displayRate = adjustedRate;

    // Updated Scaling Logic: Use thresholds to determine number of bars
    // Note: No need to adjust thresholds since we're displaying the adjusted rate
    const parsedRate = parseFloat(rate) || 0;
    let numberOfBars = 0;
    if (parsedRate >= 15) {
        numberOfBars = 4;
    } else if (parsedRate >= 10) {
        numberOfBars = 3;
    } else if (parsedRate >= 5) {
        numberOfBars = 2;
    } else if (parsedRate >= 0) {
        numberOfBars = 1;
    }

    // Color definition for bars
    const barColors = ["#FFEB3B", "#FFC107", "#FF9800", "#F44336"]; // Yellow -> Amber -> Orange -> Red
    // Height-varying bar characters
    const barChars = "▃▅▇▉";

    // Determine color for the rate number based on the last bar
    let rateColor = Colors.lime; // Default color
    if (numberOfBars > 0) {
        rateColor = barColors[numberOfBars - 1]; // Color of the last bar
    }

    // Floating animation keyframes
    const floatEffect = keyframes`
    0% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
    100% { transform: translateY(0px); }
  `;

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
            }}
        >
            <Typography
                component="div"
                sx={{
                    color: Colors.gray2,
                    fontSize: { xs: "1.2em", sm: "1.5em" },
                    fontFamily: Fonts.headline,
                    fontWeight: 500,
                }}
            >
                Gen / Sec
            </Typography>

            <Box
                sx={{
                    backgroundColor: "transparent",
                    color: Colors.lime,
                    fontWeight: "bold",
                    fontFamily: Fonts.headline,
                    fontSize: { xs: "1.5em", sm: "2.5em" },
                    height: "50px",
                    borderRadius: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s ease",
                    animation: `${floatEffect} 3s ease-in-out infinite`,
                    "& > span": {
                        display: "flex", // Use flex to align rate and bars
                        alignItems: "center", // Center items vertically
                        gap: "0.3em", // Add small gap between number and bars
                    },
                }}
            >
                <span>
                    <span style={{ color: rateColor }}>{displayRate}</span>
                    {/* Display load bars based on scaled rate */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                        }}
                    >
                        {Array.from({ length: numberOfBars }).map(
                            (_, index) => (
                                <span
                                    key={index}
                                    style={{
                                        display: "inline-block",
                                        color: barColors[index],
                                        fontSize: { xs: "0.7em", sm: "0.8em" },
                                        lineHeight: "1",
                                        marginBottom: "8px",
                                    }}
                                >
                                    {barChars[index % barChars.length]}
                                </span>
                            ),
                        )}
                    </Box>
                </span>
            </Box>
        </Box>
    );
}

// Helper function to format numbers with commas
const formatNumberWithCommas = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
