import React from "react";
import { Typography } from "@mui/material";
import { Colors } from "../config/global";
import { EmojiRephrase } from "./EmojiRephrase";

function SectionSubtitle({ subtitle, color = Colors.offwhite, textAlign = "center", size = "1.5em" }) {
  return (
    <Typography
      style={{
        color: color,
        fontSize: size,
        maxWidth: "750px",
        textAlign: textAlign,
      }}
    >
      <EmojiRephrase>
        {subtitle}
      </EmojiRephrase>
    </Typography>
  );
}

export default SectionSubtitle;