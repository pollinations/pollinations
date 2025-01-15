import React from "react"
import Button from "@mui/material/Button"
import { EmojiRephrase } from "./EmojiRephrase"

const TextEmojiButton = ({ onClick, subtitle, textColor, textSize, backgroundColor }) => {
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
        height: "80%",
        color: textColor,
        textTransform: "none",
        textDecoration: "none",
        "&:hover": {
          backgroundColor: `${backgroundColor}90`,
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
      <EmojiRephrase>{subtitle}</EmojiRephrase>
    </Button>
  )
}

export default TextEmojiButton
