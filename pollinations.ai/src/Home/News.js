import * as React from "react"
import Accordion from "@mui/material/Accordion"
import AccordionSummary from "@mui/material/AccordionSummary"
import AccordionDetails from "@mui/material/AccordionDetails"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import TextEmojiText from "../components/TextEmojiText"
import { Colors, Fonts } from "../config/global"
import { NEWS_TITLE, NEWS_SUBTITLE } from "../config/copywrite"
import { TextRephraseTranslate } from "../components/TextRephraseTranslate"

export default function News() {
  return (
    <Accordion style={{ width: "100%", backgroundColor: "Color.lime", margin: 0, padding: 0 }}>
      <AccordionSummary
        expandIcon={<ArrowDownwardIcon />}
        aria-controls="panel1-content"
        id="panel1-header"
      >
        <TextRephraseTranslate>{NEWS_TITLE}</TextRephraseTranslate>
      </AccordionSummary>
      <AccordionDetails>
        <TextRephraseTranslate>{NEWS_SUBTITLE}</TextRephraseTranslate>
      </AccordionDetails>
    </Accordion>
  )
}
