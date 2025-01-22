import React from "react"
import { SectionTitleStyle } from "./SectionContainer"
import Typography from '@mui/material/Typography';
import { LLMTextManipulator } from "./LLMTextManipulator";
function SectionTitle({ title, color }) {  
  
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
        <LLMTextManipulator>{title}</LLMTextManipulator>
      </Typography>
    </SectionTitleStyle>
  )
}

export default SectionTitle