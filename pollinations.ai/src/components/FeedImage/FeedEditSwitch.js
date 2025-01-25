import React from "react"
import { GeneralButton } from "../GeneralButton"
import { Colors, Fonts } from "../../config/global"
import { IMAGE_FEED_MODE1, IMAGE_FEED_MODE2 } from "../../config/copywrite"
import { Box } from "@mui/material"
import { LLMTextManipulator } from "../../components/LLMTextManipulator"

export function FeedEditSwitch({ toggleValue, handleToggleChange, isLoading }) {
  return (
    <Box style={{ display: "flex", width: "100%" }}>
      <GeneralButton
        handleClick={() => handleToggleChange(null, "feed")}
        borderColor={Colors.lime}
        backgroundColor={toggleValue === "feed" ? Colors.lime : `${Colors.offblack}99`}
        textColor={toggleValue === "feed" ? Colors.offblack : Colors.lime}
        style={{
          height: "70px",
          width: "100%",
          fontSize: { xs: "1.5em", md: "1.8em" },
          fontFamily: Fonts.title,
          fontWeight: 600,
          padding: "0 1em",
        }}
      >
        <LLMTextManipulator text={IMAGE_FEED_MODE1} />
      </GeneralButton>
      <GeneralButton
        handleClick={() => handleToggleChange(null, "edit")}
        borderColor={Colors.lime}
        backgroundColor={toggleValue === "edit" ? Colors.lime : `${Colors.offblack}99`}
        textColor={toggleValue === "edit" ? Colors.offblack : Colors.lime}
        style={{
          width: "100%",
          fontSize: { xs: "1.5em", md: "1.8em" },
          fontFamily: Fonts.title,
          fontWeight: 600,
          padding: "0 1em",
        }}
      >
        <LLMTextManipulator text={IMAGE_FEED_MODE2} />
      </GeneralButton>
    </Box>
  )
}
