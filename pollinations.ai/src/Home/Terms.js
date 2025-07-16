import React from "react";
import {
    SectionContainer,
    SectionSubContainer,
} from "../components/SectionContainer";
import { Colors, Fonts } from "../config/global";
import { NavLink } from "react-router-dom";
import { FOOTER_TERMS_CONDITIONS } from "../config/copywrite";
import {
    emojify,
    friendlyMarkdownStyle,
    rephrase,
} from "../config/llmTransforms";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import CloseIcon from "@mui/icons-material/Close";
import { Box } from "@mui/material";
const Terms = () => {
    return (
        <SectionContainer style={{ backgroundColor: Colors.offblack }}>
            <Box
                width="100%"
                display="flex"
                justifyContent="flex-end"
                alignItems="center"
            >
                <NavLink
                    to="/"
                    style={{
                        color: Colors.lime,
                        textDecoration: "none",
                        transition: "color 0.3s ease",
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.color = `${Colors.lime}90`)
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.color = Colors.lime)
                    }
                >
                    <CloseIcon fontSize="large" />
                </NavLink>
            </Box>
            <SectionSubContainer
                style={{
                    backgroundColor: Colors.offblack,
                    fontFamily: Fonts.headline,
                }}
            >
                <Box style={{ color: Colors.offwhite }}>
                    <LLMTextManipulator
                        text={FOOTER_TERMS_CONDITIONS}
                        transforms={[friendlyMarkdownStyle, rephrase, emojify]}
                    />
                </Box>
            </SectionSubContainer>
        </SectionContainer>
    );
};

export default Terms;
