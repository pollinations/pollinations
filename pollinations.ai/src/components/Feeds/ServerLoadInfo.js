import React, { useState, useEffect } from "react";
import { Typography, Box } from "@mui/material";
import { Colors, Fonts } from "../../config/global";
import { keyframes } from "@emotion/react";

/**
 * Shared ServerLoadInfo component for both image and text feeds
 * 
 * @param {Object} props
 * @param {Object} props.lastItem - Last received item (image or text entry)
 * @param {number} props.itemsGenerated - Count of items generated
 * @param {Object} props.currentItem - Current displayed item
 * @param {string} props.itemType - Type of item ("image" or "text")
 */
export function ServerLoadInfo({ lastItem, itemsGenerated, currentItem, itemType }) {
  // Simulate load when concurrentRequests is not available
  const [simulatedLoad, setSimulatedLoad] = useState(2);

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

  return (
    <Box
      display="flex"
      flexDirection={{ xs: "column", sm: "row" }}
      justifyContent="center"
      alignItems="center"
      style={{ gap: "2em" }}
      sx={{
        color: Colors.offwhite,
        fontSize: "1.em",
      }}
    >
      <ServerLoadDisplay concurrentRequests={lastItem?.concurrentRequests || simulatedLoad} />
      <CountBadge itemsGenerated={itemsGenerated || 0} />
      {/* <TimingInfo item={lastItem} /> */}
    </Box>
  );
}

function ServerLoadDisplay({ concurrentRequests }) {
  const barChars = "▁▃▅▇▉";
  
  // Generate a pattern that increases in height
  const getLoadDisplay = (count) => {
    let displayString = '';
    for (let i = 0; i < count; i++) {
      // Use modulo to cycle through the bar characters for an increasing pattern
      const index = i % barChars.length;
      displayString += barChars[index];
    }
    return displayString;
  };

  const loadDisplay = getLoadDisplay(Math.round(concurrentRequests));

  // Badge color changes based on the load
  const getBadgeColor = () => {
    if (concurrentRequests < 2) return Colors.lime;
    if (concurrentRequests < 4) return "#FFC107"; // amber
    return Colors.special; // high load color
  };
  
  // Blinking animation keyframes with dynamic color
  const blinkEffect = keyframes`
    0% { color: ${getBadgeColor()}; text-shadow: 0 0 20px ${getBadgeColor()}; }
    50% { color: ${getBadgeColor()}99; text-shadow: 0 0 10px ${getBadgeColor()}99; }
    100% { color: ${getBadgeColor()}; text-shadow: 0 0 5px ${getBadgeColor()}; }
  `;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: "1000px",
      }}
    >
      <Typography
        component="div"
        sx={{
          color: Colors.offwhite,
          fontSize: "1.5em",
          fontFamily: Fonts.headline,
          fontWeight: 500,
        }}
      >
        Load
      </Typography>

      <Box
        key={concurrentRequests} // Key changes trigger re-render and restart animation
        sx={{
          backgroundColor: "transparent",
          color: getBadgeColor(),
          animation: `${blinkEffect} 1s ease-in-out`,
          fontWeight: "bold",
          fontFamily: Fonts.headline,
          fontSize: "1.5em",
          width: "150px",
          height: "50px",
          borderRadius: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s ease",
          "& > span": {
            marginTop: "-3px", // Move text 3px higher
          },
        }}
      >
        <span>{loadDisplay}</span>
      </Box>
    </Box>
  );
}

function CountBadge({ itemsGenerated }) {
  const formattedCount = formatNumberWithCommas(itemsGenerated);
  
  // Blinking animation keyframes
  const blinkEffect = keyframes`
    0% { color: ${Colors.special}; text-shadow: 0 0 20px ${Colors.special}; }
    50% { color: ${Colors.special}99; text-shadow: 0 0 10px ${Colors.special}99; }
    100% { color: ${Colors.special}; text-shadow: 0 0 5px ${Colors.special}; }
  `;
  
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: "1000px",
      }}
    >
      <Typography
        component="div"
        sx={{
          color: Colors.offwhite,
          fontSize: "1.5em",
          fontFamily: Fonts.headline,
          fontWeight: 500,
        }}
      >
        Generated #
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          width: "100%",
        }}
      >
        <Box
          key={itemsGenerated} // Key changes trigger re-render and restart animation
          sx={{
            backgroundColor: "transparent",
            color: Colors.lime,
            animation: `${blinkEffect} 1s ease-in-out`,
            fontWeight: "bold",
            fontFamily: Fonts.headline,
            fontSize: "2.5em",
            height: "50px",
            width: "250px",
            borderRadius: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s ease",
            "& > span": {
              marginTop: "-3px", // Move text 3px higher
            },
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

// Helper function to format numbers with commas
const formatNumberWithCommas = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}; 