import React from "react";
import { Typography, useMediaQuery } from "@mui/material";
import { Colors } from "../config/global";

function SectionTitle({ title }) {
  const isSmallScreen = useMediaQuery("(max-width:600px)");
  const fontSize = isSmallScreen ? "6em" : "8em";
  return (
    <Typography
      style={{
        color: Colors.lime,
        fontSize: fontSize,
        fontWeight: "bold",
        textAlign: "center",
        marginTop: "0.5em",
        userSelect: "none",
        letterSpacing: "0.1em",
      }}
    >
      {title}
    </Typography>
  );
}

export default SectionTitle;
