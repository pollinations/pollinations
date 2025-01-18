import React from "react"
import { SectionTitleStyle } from "./SectionContainer"
import Typography from '@mui/material/Typography';

function SectionTitle({ title, color }) {  
  
  return (
    <SectionTitleStyle color={color}>
      <Typography
        variant="inherit"
        sx={{
          fontSize: 'inherit',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        {title}
      </Typography>
    </SectionTitleStyle>
  )
}

export default SectionTitle
