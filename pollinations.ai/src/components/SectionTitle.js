import React from "react"
import { SectionTitleStyle } from "./SectionContainer"
import Typography from '@mui/material/Typography';
import { LLMTextManipulator } from "./LLMTextManipulator";
import { friendlyMarkdownStyle, oneSentence, translate } from "../config/llmTransforms";

function SectionTitle({ title, color }) {  
;

  return (
    <SectionTitleStyle color={color}>
      <Typography
        variant="inherit"
        component="div"
        sx={{
          fontSize: 'inherit',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        <LLMTextManipulator text={title} transforms={[translate]} />
      </Typography>
    </SectionTitleStyle>
  )
}

export default SectionTitle
