import * as React from "react"
import Accordion from "@mui/material/Accordion"
import AccordionSummary from "@mui/material/AccordionSummary"
import AccordionDetails from "@mui/material/AccordionDetails"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { Colors, Fonts } from "../config/global"
import { NEWS_TITLE, NEWS_LIST } from "../config/copywrite"
import { rephrase, emojify } from "../config/llmTransforms"
import { SectionContainer, SectionHeadlineStyle } from "../components/SectionContainer"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { trackEvent } from "../config/analytics"

export default function News() {
  const handleAccordionChange = (event, isExpanded) => {
    if (isExpanded) {
      trackEvent({
        action: 'click_accordion',
        category: 'news',
      })
    }
  }

  const handleClickAccordionSummary = (event) => {
    if (event.target.tagName.toLowerCase() === "a") {
      event.stopPropagation()
    }
  }

  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <Accordion
        style={{
          width: "100%",
          margin: 0,
          padding: 0,
          borderRadius: "0em",
        }}
        onChange={handleAccordionChange}
      >
        <AccordionSummary
          sx={{
            backgroundColor: Colors.special,
            "&:hover": {
              backgroundColor: `${Colors.special}99`,
            },
          }}
          expandIcon={<ArrowDownwardIcon style={{ color: Colors.offwhite }} />}
          aria-controls="panel1-content"
          id="panel1-header"
        >
          <SectionHeadlineStyle
            color={Colors.offwhite}
            maxWidth="90%"
            style={{ fontSize: "1.6em", fontFamily: Fonts.headline }}
            textAlign="left"
            onClick={handleClickAccordionSummary}
          >
            <LLMTextManipulator text={NEWS_TITLE} transforms={[rephrase, emojify]} />
          </SectionHeadlineStyle>
        </AccordionSummary>
        <AccordionDetails style={{ backgroundColor: Colors.offblack }}>
          <SectionHeadlineStyle
            color={Colors.offwhite}
            style={{ fontSize: "1.2em", fontFamily: Fonts.title }}
            textAlign="left"
            maxWidth="90%"
          >
            <LLMTextManipulator text={NEWS_LIST} transforms={[rephrase, emojify]} />
          </SectionHeadlineStyle>
        </AccordionDetails>
      </Accordion>
    </SectionContainer>
  )
}
