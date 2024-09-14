import React from "react"
import IconButton from "@material-ui/core/IconButton"
import { NavLink } from "react-router-dom"
import TemporaryDrawer from "./Drawer"
import styled from "@emotion/styled"
import { MOBILE_BREAKPOINT, BaseContainer, Colors } from "../styles/global"
import { CloseOutlined } from "@material-ui/icons"
import MobileMenuIcon from "../assets/menuIcon.svg"
import { SocialLinks } from "./Social"
import { ImageURLHeading } from "../pages/Home/ImageHeading"

const StyledLink = styled.a`
  transition: color 0.3s ease;
  &:hover {
    color: ${Colors.primary};
  }
`

const TopBar = () => {
  const drawerState = React.useState(false)

  const handleLinkClick = (e) => {
    e.preventDefault()
    const link = e.currentTarget.href
    navigator.clipboard.writeText(link).then(() => {
      console.log(`Copied to clipboard: ${link}`)
    })
  }

  return (
    <OuterContainer>
      <TopContainer>
        <PublicNav drawerState={drawerState} handleLinkClick={handleLinkClick} />
      </TopContainer>
      <MobileMenu drawerState={drawerState} handleLinkClick={handleLinkClick} />
    </OuterContainer>
  )
}

const PublicNav = ({ drawerState, handleLinkClick }) => (
  <>
    <LogoContainer>
      <NavLink to="/">
        <ImageURLHeading
          whiteText={false}
          width={300}
          height={100}
          customPrompt={`an image with the text "Pollinations" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in black, set against a solid white background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font. The text should take all the space without any margins`}
          style={{ userSelect: "none" }} // Added to prevent selection
        />
      </NavLink>
    </LogoContainer>
    <NavBarStyle>
      <SocialLinks small hideOnMobile gap="1em" invert />
      <MenuButton>
        <IconButton onClick={() => drawerState[1](true)}>
          <img
            src={MobileMenuIcon}
            style={{ position: "absolute", top: "25%", left: "25%", width: "50%", height: "50%" }}
          />
          <CloseOutlined style={{ position: "relative", color: "transparent" }} />
        </IconButton>
      </MenuButton>
    </NavBarStyle>
  </>
)

const MobileMenu = ({ drawerState, handleLinkClick }) => (
  <TemporaryDrawer drawerState={drawerState}>
    <MobileMenuStyle>
      <MobileCloseIconStyle>
        <IconButton onClick={() => drawerState[1](false)}>
          <CloseOutlined />
        </IconButton>
      </MobileCloseIconStyle>
      <CTAStyle>
        <ImageURLHeading
          whiteText={true}
          width={250}
          height={100}
          customPrompt={`an image with the text "Let's talk" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in white, set against a solid black background, creating a striking and bold visual contrast. Incorporate many colorful elements related to communication, such as speech bubbles, chat icons, mouths, and other related forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. The text should take all the space without any margins. <3`}
        />
        <StyledLink href="mailto:hello@pollinations.ai" onClick={handleLinkClick}>
          <span>hello@pollinations.ai</span>
        </StyledLink>
      </CTAStyle>
      <SocialLinks medium gap="1em" />
    </MobileMenuStyle>
  </TemporaryDrawer>
)

const OuterContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`
const MobileMenuStyle = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  padding: 1em 1em 3em;
`
const MobileCloseIconStyle = styled.div`
  position: absolute;
  top: 1em;
  right: 1em;
  .MuiIconButton-root:hover {
    background-color: white;
    color: black;
  }
`
const CTAStyle = styled.div`
  font-style: normal;
  font-weight: 500;
  font-size: 24px;
  line-height: 36px;
  text-align: center;
  padding-bottom: 2em;
`
const TopContainer = styled.div`
  background-color: #fefefe;
  z-index: 1;
  width: 100%;
  padding: 0 20px;
  display: flex;
  justify-content: center;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    padding: 10;
  }
  @media (min-width: ${MOBILE_BREAKPOINT}) {
    padding-top: 0; /* Remove top padding for desktop view */
  }
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
    grid-template-areas: "logo nav mobilebutton social";
  }
`

const LogoContainer = styled.div`
  grid-area: logo;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
`

const MenuButton = styled.div`
  grid-area: mobilebutton;
  justify-self: flex-end;
  @media (min-width: ${MOBILE_BREAKPOINT}) {
    display: none;
  }
  .MuiIconButton-root:hover {
    background-color: white;
    filter: invert(100%);
  }
`

export default TopBar
