import * as React from "react"
import Accordion from "@mui/material/Accordion"
import AccordionSummary from "@mui/material/AccordionSummary"
import AccordionDetails from "@mui/material/AccordionDetails"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { Colors, Fonts } from "../config/global"
import { NEWS_TITLE, NEWS_LIST } from "../config/copywrite"
import { TextRephraseTranslate } from "../components/TextRephraseTranslate"
import {SectionContainer} from "../components/SectionContainer"

export default function News() {
  return (
    <SectionContainer>
      <Accordion style={{ width: "100%", backgroundColor: Colors.lime, margin: 0, padding: 0 }}>
        <AccordionSummary
          expandIcon={<ArrowDownwardIcon />}
        aria-controls="panel1-content"
        id="panel1-header"
        style={{ fontFamily: Fonts.body, fontSize: "1.5em" }}
      >
        <TextRephraseTranslate>{NEWS_TITLE}</TextRephraseTranslate>
      </AccordionSummary>
      <AccordionDetails style={{ fontFamily: Fonts.body, fontSize: "1.5em" }}>
        <TextRephraseTranslate>{NEWS_LIST}</TextRephraseTranslate>
      </AccordionDetails>
    </Accordion>
    </SectionContainer>
  )
}
