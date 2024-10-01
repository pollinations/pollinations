import React from "react"
import { NavLink } from "react-router-dom"
import styled from "@emotion/styled"
import { MOBILE_BREAKPOINT, BaseContainer, Colors } from "../styles/global"
import { SocialLinks } from "./Social"
import { ImageURLHeading } from "../pages/Home/ImageHeading"
import AsciiArtGenerator from "./AsciiArtGenerator" // Import the AsciiArtGenerator
import useIsMobile from "../hooks/useIsMobile"; // Import the new hook

const TopBar = () => {
  const isMobile = useIsMobile(); // Use the new hook
  return (
    <TopContainer>
      {isMobile ? (
        <MobileNavContainer>
          <CenteredSocialLinks>
            <SocialLinks medium gap="1em" invert />
          </CenteredSocialLinks>
          <LogoContainer isMobile={isMobile}>
            <NavLink to="/">
              <ImageURLHeading
                whiteText={false}
                width={400}
                height={100}
                style={{ userSelect: "none", maxWidth: "100%" }} // Added to prevent selection and ensure max width
              >
                Pollinations
              </ImageURLHeading>
            </NavLink>
            <AsciiArtContainer>
              <AsciiArtGenerator />
            </AsciiArtContainer>
          </LogoContainer>
        </MobileNavContainer>
      ) : (
        <>
          <LogoContainer>
            <NavLink to="/">
              <ImageURLHeading
                whiteText={false}
                width={500}
                height={100}
                style={{ userSelect: "none", maxWidth: "100%" }} // Added to prevent selection and ensure max width
              >
                Pollinations
              </ImageURLHeading>
            </NavLink>
            <AsciiArtContainer width={500} height={100}>
              <AsciiArtGenerator />
            </AsciiArtContainer>
          </LogoContainer>
          <NavBarStyle>
            <SocialLinks medium gap="1em" invert />
          </NavBarStyle>
        </>
      )}
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
  background-color: #fefefe;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 30px;
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
  position: relative; /* Added to position the AsciiArtContainer */
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
  pointer-events: none; /* Ensure it doesn't interfere with other elements */
`

export default TopBar
