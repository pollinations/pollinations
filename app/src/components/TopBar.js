import React from "react"
import IconButton from "@material-ui/core/IconButton"
import { NavLink } from "react-router-dom"
import TemporaryDrawer from "./Drawer"
import styled from "@emotion/styled"
import { MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer, Colors } from "../styles/global"
import { CloseOutlined } from "@material-ui/icons"
import MobileMenuIcon from "../assets/menuIcon.svg"
import { SocialLinks } from "./Social"
import { ImageURLHeading } from "../pages/Home/styles"

const TopBar = () => {
  const drawerState = React.useState(false)

  return (
    <OuterContainer>
      <TopContainer>
        <PublicNav drawerState={drawerState} />
      </TopContainer>
      <MobileMenu drawerState={drawerState} />
    </OuterContainer>
  )
}

const PublicNav = ({ drawerState }) => (
  <>
  <LogoContainer>
  <ImageURLHeading
    whiteText={false}
    width={300}
    height={100}
    customPrompt={`an image with the text "Pollinations" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in black, set against a solid white background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font. The text should take all the space without any margins.`}
  />
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

const MobileMenu = ({ drawerState }) => (
  <TemporaryDrawer drawerState={drawerState}>
    <MobileMenuStyle>
      <MobileCloseIconStyle>
        <IconButton onClick={() => drawerState[1](false)}>
          <CloseOutlined />
        </IconButton>
      </MobileCloseIconStyle>
      <CTAStyle>
        Let's talk
        <br />
        <span> hello@pollinations.ai </span>
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

const CTAStyle = styled.p`
  font-style: normal;
  font-weight: 500;
  font-size: 24px;
  line-height: 36px;
  text-align: center;
  color: #ffffff;
  padding-bottom: 0em;
  span {
    color: ${Colors.lime};
  }
`
const TopContainer = styled.div`
  position: absolute;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 0 30px;
  display: flex;
  justify-content: center;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    padding: 0;
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
