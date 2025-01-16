import React from "react"
import Button from "@mui/material/Button"
import { TextRephraseTranslate } from "./TextRephraseTranslate"

const TextEmojiButton = ({
  onClick,
  subtitle,
  textColor,
  textSize,
  backgroundColor,
  borderColor = "transparent",
}) => {
  return (
    <Button
      onClick={onClick}
      sx={{
        userSelect: "none",
        backgroundColor: backgroundColor,
        borderRadius: "15px",
        display: "flex",
        padding: "0em 1em",
        fontSize: textSize,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-end",
        width: "100%",
        color: textColor,
        textTransform: "none",
        textDecoration: "none",
        borderColor: borderColor,
        borderWidth: "1px",
        borderStyle: "solid",
        lineHeight: "1.5em",
        "&:hover": {
          backgroundColor: `${backgroundColor}90`,
          borderColor: `${borderColor}90`,
        },
        "& a": {
          textDecoration: "none",
          color: "inherit",
        },
        "& strong": {
          fontWeight: "bold",
          color: "inherit",
        },
        "& em": {
          fontStyle: "italic",
          color: "inherit",
        },
      }}
    >
      <TextRephraseTranslate>{subtitle}</TextRephraseTranslate>
    </Button>
  )
}

export default TextEmojiButton
