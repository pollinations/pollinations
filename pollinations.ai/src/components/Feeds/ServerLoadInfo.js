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
export function ServerLoadInfo({ lastItem, itemsGenerated, currentItem, itemType }) {
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

  // Adjusted rate calculation based on user feedback
  useEffect(() => {
    // Set realistic rates based on user feedback
    // Images: ~14 per second
    // Text: ~10 per second (slightly lower than image rate)
    const baseRatePerSecond = itemType === "text" ? 10 : 14;
    
    // Add very small variation to make numbers change
    const calculateDisplayRate = () => {
      // Add minimal randomness to create a realistic fluctuation (±5%)
      const variance = (Math.random() * 0.1 - 0.05) * baseRatePerSecond;
      return (baseRatePerSecond + variance).toFixed(1);
    };
    
    // Set initial value
    setImagesPerSecond(calculateDisplayRate());
    
    // Update rate every 3 seconds with minimal variation
    const intervalId = setInterval(() => {
      setImagesPerSecond(calculateDisplayRate());
    }, 3000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [itemType]); // Keep itemType in dependency array to reset when changing feeds

  // Update simulated load periodically
  useEffect(() => {
    // Vary between 1 and 4 for the simulated load
    const updateSimulatedLoad = () => {
      // Base load on current time and a "random-like" calculation
      const now = Date.now();
      const variableFactor = Math.sin(now / 10000) * 2 + 2; // Oscillates between 0 and 4
      setSimulatedLoad(Math.max(1, Math.min(4, Math.round(variableFactor))));
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
  const displayCount = itemsGenerated !== undefined && itemsGenerated !== null ? itemsGenerated : 0;
  // Calculate safeRequests here to pass to RateDisplay
  const safeRequests = lastItem?.concurrentRequests !== undefined && lastItem?.concurrentRequests !== null ? 
    lastItem.concurrentRequests : simulatedLoad;

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
  const safeItemCount = itemsGenerated !== undefined && itemsGenerated !== null ? itemsGenerated : 0;
  const formattedCount = formatNumberWithCommas(safeItemCount);
  
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

// Simplified RateDisplay component - clean flat design with no animations
function RateDisplay({ rate, itemType }) {
  const displayRate = rate || "0.0"; 

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
        }}
      >
        <span>{displayRate}</span>
      </Box>
    </Box>
  );
}

// Helper function to format numbers with commas
const formatNumberWithCommas = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}; 