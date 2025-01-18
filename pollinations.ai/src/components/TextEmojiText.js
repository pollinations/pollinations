import React from "react"
import { Colors } from "../config/global"
import { TextRephraseTranslate } from "./TextRephraseTranslate"
import { SectionHeadlineStyle } from "./SectionContainer"

function TextEmojiText({ subtitle, color, textAlign, fontSize, sx = {} }) {
  return (
    <SectionHeadlineStyle
      fontSize={fontSize}
      color={color}
      style={{
        textAlign: textAlign,
        maxWidth: "750px",
        ...sx,
      }}
    >
      <TextRephraseTranslate>{subtitle}</TextRephraseTranslate>
    </SectionHeadlineStyle>
  )
}

export default TextEmojiText
