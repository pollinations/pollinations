import * as React from "react"
import Accordion from "@mui/material/Accordion"
import AccordionSummary from "@mui/material/AccordionSummary"
import AccordionDetails from "@mui/material/AccordionDetails"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { Colors, Fonts } from "../config/global"
import { NEWS_TITLE, NEWS_LIST } from "../config/copywrite"
import { SectionContainer, SectionHeadlineStyle } from "../components/SectionContainer"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { trackEvent } from "../config/analytics"

export default function News() {
  const handleAccordionChange = (event, isExpanded) => {
    if (isExpanded) {
      trackEvent({
        action: 'Accordion_Open',
        category: 'User_Interactions',
        label: 'News_Accordion_Open'
      })
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
            backgroundColor: Colors.lime,
            "&:hover": {
              backgroundColor: `${Colors.lime}99`
            }
          }}
          expandIcon={
            <ArrowDownwardIcon
              style={{ color: Colors.offblack }}
            />
          }
          aria-controls="panel1-content"
          id="panel1-header"
        >
          <SectionHeadlineStyle
            color={Colors.offblack}
            style={{ fontSize: "1.5em", fontFamily: Fonts.headline, lineHeight: "0em" }}
          >
            <LLMTextManipulator text={NEWS_TITLE} />
          </SectionHeadlineStyle>
        </AccordionSummary>
        <AccordionDetails style={{ backgroundColor: Colors.offblack2 }}>
          <SectionHeadlineStyle
            color={Colors.offwhite}
            style={{ fontSize: "1.2em", fontFamily: Fonts.title }}
            textAlign="left"
          >
            <LLMTextManipulator text={NEWS_LIST} />
          </SectionHeadlineStyle>
        </AccordionDetails>
      </Accordion>
    </SectionContainer>
  )
}
