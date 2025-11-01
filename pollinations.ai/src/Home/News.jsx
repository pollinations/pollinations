import * as React from "react";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { Colors, Fonts } from "../config/global";
import { NEWS_TITLE, NEWS_LIST } from "../config/copywrite";
import { rephrase, emojify } from "../config/llmTransforms";
import {
    SectionContainer,
    SectionHeadlineStyle,
} from "../components/SectionContainer";
import { LLMTextManipulator } from "../components/LLMTextManipulator";
import { trackEvent } from "../config/analytics.js";

export default function News() {
    const handleAccordionChange = (event, isExpanded) => {
        if (isExpanded) {
            trackEvent({
                action: "click_accordion",
                category: "news",
            });
        }
    };

    const handleClickAccordionSummary = (event) => {
        if (event.target.tagName.toLowerCase() === "a") {
            event.stopPropagation();
        }
    };

    return (
        <SectionContainer id="news" style={{ backgroundColor: Colors.offwhite }}>
            <Accordion
                sx={{
                    width: "100%",
                    // maxWidth: "1000px",
                    margin: 0,
                    padding: 0,
                    borderRadius: "2em !important",
                    "&:before": {
                        display: "none",
                    },
                    ".MuiAccordion-region": {
                        borderBottomLeftRadius: "2em",
                        borderBottomRightRadius: "2em",
                    },
                }}
                onChange={handleAccordionChange}
            >
                <AccordionSummary
                    sx={{
                        padding: "0.5em 2em",
                        backgroundColor: Colors.special,
                        "&:hover": {
                            backgroundColor: `${Colors.special}99`,
                        },
                        borderRadius: "0em",
                        "&.Mui-expanded": {
                            borderBottomLeftRadius: 0,
                            borderBottomRightRadius: 0,
                        },
                        "& .MuiAccordionSummary-expandIconWrapper": {
                            transform: "scale(2.0)",
                            "&.Mui-expanded": {
                                transform:
                                    "rotate(180deg) scale(2.0) translateX(0.2em)",
                            },
                        },
                    }}
                    expandIcon={
                        <ArrowDownwardIcon
                            style={{
                                color: Colors.offwhite,
                                fontSize: "1.5rem",
                                marginRight: "0.2em",
                            }}
                        />
                    }
                    aria-controls="panel1-content"
                    id="panel1-header"
                >
                    <SectionHeadlineStyle
                        color={Colors.offwhite}
                        maxWidth="95%"
                        style={{
                            fontSize: "1.8em",
                            fontFamily: Fonts.headline,
                            marginLeft: "0.6em",
                        }}
                        textAlign="left"
                        onClick={handleClickAccordionSummary}
                    >
                        <LLMTextManipulator
                            text={NEWS_TITLE}
                            transforms={[rephrase, emojify]}
                        />
                    </SectionHeadlineStyle>
                </AccordionSummary>
                <AccordionDetails
                    sx={{
                        backgroundColor: Colors.offblack,
                    }}
                >
                    <SectionHeadlineStyle
                        color={Colors.offwhite}
                        style={{
                            fontSize: "1.2em",
                            fontFamily: Fonts.headline,
                        }}
                        textAlign="left"
                        maxWidth="90%"
                    >
                        <LLMTextManipulator
                            text={NEWS_LIST}
                            transforms={[rephrase, emojify]}
                        />
                    </SectionHeadlineStyle>
                </AccordionDetails>
            </Accordion>
        </SectionContainer>
    );
}
