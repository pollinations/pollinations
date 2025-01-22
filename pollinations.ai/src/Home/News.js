import * as React from "react"
import Accordion from "@mui/material/Accordion"
import AccordionSummary from "@mui/material/AccordionSummary"
import AccordionDetails from "@mui/material/AccordionDetails"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { Colors, Fonts } from "../config/global"
import { NEWS_TITLE, NEWS_LIST } from "../config/copywrite"
import { SectionContainer, SectionHeadlineStyle } from "../components/SectionContainer"
import { LLMTextManipulator } from "../components/LLMTextManipulator"

export default function News() {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <Accordion style={{ width: "100%", backgroundColor: Colors.lime, margin: 0, padding: 0 }}>
        <AccordionSummary
          expandIcon={<ArrowDownwardIcon />}
          aria-controls="panel1-content"
          id="panel1-header"
        >
          <SectionHeadlineStyle color={Colors.offblack} style={{ fontSize: "2em", fontFamily: Fonts.headline }}>
            <LLMTextManipulator>{NEWS_TITLE}</LLMTextManipulator>
          </SectionHeadlineStyle>
        </AccordionSummary>
        <AccordionDetails>
          <SectionHeadlineStyle color={Colors.offblack} style={{ fontSize: "1.2em", fontFamily: Fonts.headline }} textAlign="left">
            <LLMTextManipulator>{NEWS_LIST}</LLMTextManipulator>
          </SectionHeadlineStyle>
        </AccordionDetails>
      </Accordion>
    </SectionContainer>
  )
}
