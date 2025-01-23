import React from "react"
import styled from "@emotion/styled"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer"
import { Colors, Fonts } from "../config/global"
import { CircularProgress, Box } from "@mui/material"
import { NavLink } from "react-router-dom"
import { FOOTER_TERMS_CONDITIONS } from "../config/copywrite"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import CancelPresentationOutlinedIcon from '@mui/icons-material/CancelPresentationOutlined';

const Terms = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack }}>
      <Box width="100%" display="flex" justifyContent="flex-end" alignItems="center">
        <NavLink
          to="/"
          style={{
            color: Colors.lime,
            textDecoration: "none",
            transition: "color 0.3s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = `${Colors.lime}90`)}
          onMouseLeave={(e) => (e.currentTarget.style.color = Colors.lime)}
        >
          <CancelPresentationOutlinedIcon fontSize="large"/>
        </NavLink>
      </Box>
      <SectionSubContainer style={{ backgroundColor: Colors.offblack, fontFamily: Fonts.headline }}>
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
  a {
    color: ${Colors.lime};
    text-decoration: none;
    &:hover {
      color: ${Colors.lime}90;
    }
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
