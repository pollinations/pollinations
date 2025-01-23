import React from "react"
import styled from "@emotion/styled"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer"
import { Colors } from "../config/global"
import { CircularProgress, Box } from "@mui/material"
import { NavLink } from "react-router-dom"
import { FOOTER_TERMS_CONDITIONS, FOOTER_CLOSE } from "../config/copywrite"
import { LLMTextManipulator } from "../components/LLMTextManipulator"

const Terms = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack, position: "relative" }}>
      <NavLink
        to="/"
        style={{
          position: "absolute",
          top: "30px",
          right: "30px",
          color: Colors.lime,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
        }}
      >
        <LLMTextManipulator>{FOOTER_CLOSE}</LLMTextManipulator>
      </NavLink>
      <SectionSubContainer style={{ backgroundColor: Colors.offblack }}>
        {FOOTER_TERMS_CONDITIONS ? (
          <MarkDownStyle>
            <LLMTextManipulator>{FOOTER_TERMS_CONDITIONS}</LLMTextManipulator>
          </MarkDownStyle>
        ) : (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress sx={{ color: Colors.offwhite }} />
          </Box>
        )}
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Terms

const MarkDownStyle = styled.div`
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p,
  li,
  blockquote {
    color: ${Colors.offwhite};
  }
  h6 {
    font-size: 1.3rem;
    font-weight: 700;
    line-height: 1.6;
  }
  p {
    font-size: 1.1rem;
    line-height: 1.43;
  }
`
