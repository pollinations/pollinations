import React from "react";
import { GeneralButton } from "../GeneralButton";
import { Colors, Fonts } from "../../config/global";
import { noLink } from "../../config/llmTransforms";
import { Box } from "@mui/material";
import { LLMTextManipulator } from "../LLMTextManipulator";

export function FeedEditSwitch({ 
  toggleValue, 
  handleToggleChange, 
  isLoading, 
  feedModeText1,
  feedModeText2 
}) {
  return (
    <Box style={{ display: "flex", width: "100%", justifyContent: "center" }}>
      <GeneralButton
        handleClick={() => handleToggleChange(null, "feed")}
        borderColor={Colors.lime}
        backgroundColor={toggleValue === "feed" ? Colors.lime : Colors.offblack}
        textColor={toggleValue === "feed" ? Colors.offblack : Colors.lime}
        style={{
          height: "70px",
          width: "auto",
          minWidth: "180px",
          fontSize: { xs: "1.5em", md: "1.8em" },
          fontFamily: Fonts.title,
          fontWeight: 600,
          padding: "0 1em",
        }}
      >
        <LLMTextManipulator text={feedModeText1} transforms={[noLink]} />
      </GeneralButton>
      <GeneralButton
        handleClick={() => handleToggleChange(null, "edit")}
        borderColor={Colors.lime}
        backgroundColor={toggleValue === "edit" ? Colors.lime : Colors.offblack}
        textColor={toggleValue === "edit" ? Colors.offblack : Colors.lime}
        style={{
          width: "auto",
          minWidth: "180px",
          fontSize: { xs: "1.5em", md: "1.8em" },
          fontFamily: Fonts.title,
          fontWeight: 600,
          padding: "0 1em",
        }}
      >
        <LLMTextManipulator text={feedModeText2} transforms={[noLink]} />
      </GeneralButton>
    </Box>
  );
} 