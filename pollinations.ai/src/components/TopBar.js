import React from "react"
import { NavLink } from "react-router-dom"
import styled from "@emotion/styled"
import { MOBILE_BREAKPOINT, BaseContainer, Colors } from "../styles/global"
import { SocialLinks } from "./Social"
import { ImageURLHeading } from "../pages/Home/ImageHeading"
import AsciiArtGenerator from "./AsciiArtGenerator"
import useIsMobile from "../hooks/useIsMobile"
import { Typography } from "@mui/material"
import logo from "../assets/imgs/thot-labs_logo.svg"

const TopBar = () => {
  const isMobile = useIsMobile();
  return (
    <TopContainer>
      < LogoContainer isMobile={isMobile}>
        <NavLink
          to="/"
          style={{
            textDecoration: "none",
          }}
        >
          <Typography
            style={{
              color: Colors.offblack,
              fontSize: isMobile ? "3em" : "3em",
              fontWeight: "bold",
              margin: "0",
              userSelect: "none",
              height: "auto",
            }}
          >
            THOT Labs
          </Typography>
        </NavLink>
      </LogoContainer>
    </TopContainer>
  )
}

const OuterContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`

const MobileNavContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`

const TopContainer = styled.div`
  background: linear-gradient(to bottom, ${Colors.gray2}, ${Colors.offwhite});
  width: 100%;
  display: flex;
  padding-top: 0em;
  padding-bottom: 0em;
  margin: 0;
  justify-content: center;
  align-items: flex-end;
`

const NavBarStyle = styled(BaseContainer)`
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto;
  grid-template-areas: "logo nav social";
  align-content: center;
  gap: 1em;
  font-size: 1rem;
  .MuiTypography-colorPrimary {
    color: #fdfdfd !important;
  }
  padding: 1% 0 2%; /* Added padding-bottom here */
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-template-areas: ${({ isMobile }) =>
      isMobile ? `"social" "logo"` : `"logo nav mobilebutton social"`};
    justify-items: center;
  }
`
const LogoContainer = styled.div`
  grid-area: logo;
  display: flex;
  align-items: ${({ isMobile }) => (isMobile ? "center" : "flex-start")};
  justify-content: ${({ isMobile }) => (isMobile ? "center" : "flex-start")};
  width: 100%;
  max-width: 1000px;
  position: relative;
`

const CenteredSocialLinks = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
  margin-bottom: 3em;
`

const AsciiArtContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`

export default TopBar
