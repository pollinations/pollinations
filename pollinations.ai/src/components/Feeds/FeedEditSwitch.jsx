import React from "react";
import { GeneralButton } from "../GeneralButton";
import { Colors, Fonts } from "../../config/global";
import { doNotRephrase, noLink, translate } from "../../config/llmTransforms";
import { Box } from "@mui/material";
import { LLMTextManipulator } from "../LLMTextManipulator.jsx";

export function FeedEditSwitch({
    toggleValue,
    handleToggleChange,
    isLoading,
    feedModeText1,
    feedModeText2,
}) {
    const sharedButtonStyles = {
        height: "70px",
        minWidth: { xs: "120px", sm: "150px" },
        fontSize: "1.8em",
        fontFamily: Fonts.title,
        fontWeight: 600,
        padding: "0 0.5em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    };

    return (
        <Box
            sx={{
                display: "flex",
                width: "100%",
                justifyContent: "center",
            }}
        >
            <GeneralButton
                handleClick={() => handleToggleChange(null, "feed")}
                borderColor={Colors.lime}
                backgroundColor={
                    toggleValue === "feed" ? Colors.lime : Colors.offblack
                }
                textColor={
                    toggleValue === "feed" ? Colors.offblack : Colors.lime
                }
                style={sharedButtonStyles}
            >
                <LLMTextManipulator
                    text={feedModeText1}
                    transforms={[noLink, doNotRephrase]}
                />
            </GeneralButton>
            <GeneralButton
                handleClick={() => handleToggleChange(null, "edit")}
                borderColor={Colors.lime}
                backgroundColor={
                    toggleValue === "edit" ? Colors.lime : Colors.offblack
                }
                textColor={
                    toggleValue === "edit" ? Colors.offblack : Colors.lime
                }
                style={sharedButtonStyles}
            >
                <LLMTextManipulator
                    text={feedModeText2}
                    transforms={[noLink, doNotRephrase]}
                />
            </GeneralButton>
        </Box>
    );
}
