import React from 'react'
import IconButton from "@material-ui/core/IconButton"
import { NavLink } from "react-router-dom"
import TemporaryDrawer from "./Drawer"
import styled from "@emotion/styled"
import { MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer, Colors } from "../styles/global"
import { CloseOutlined } from "@material-ui/icons"
import MobileMenuIcon from '../assets/menuIcon.svg'
import Logo from './Logo'
import NavigationItems from "./NavigationItems"
import { SocialLinks } from './Social'
import { MAIN_NAV_ROUTES } from '../routes/publicRoutes'

const TopBar = () => {

  const drawerState = React.useState(false);

  return <OuterContainer>
    <TopContainer>
      <PublicNav drawerState={drawerState} navRoutes={MAIN_NAV_ROUTES} />
    </TopContainer>
    <MobileMenu navRoutes={MAIN_NAV_ROUTES} drawerState={drawerState} />
  </OuterContainer>
};

const PublicNav = ({ navRoutes, drawerState }) => <NavBarStyle>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginLeft: '1em' }}>
    {/*<StyledNavLink to='/' >*/}
    <Logo size='150px' small='150px' />
    {/*</StyledNavLink>*/}
  </div>
  {/*<NavigationItems navRoutes={navRoutes} isEnd/>*/}
  <SocialLinks small hideOnMobile gap='1em' invert />
  <MenuButton>
    <IconButton onClick={() => drawerState[1](true)} >
      <img src={MobileMenuIcon} style={{ position: 'absolute', top: '25%', left: '25%', width: '50%', height: '50%' }} />
      <CloseOutlined style={{ position: 'relative', color: 'transparent' }} />
    </IconButton>
  </MenuButton>
</NavBarStyle>;

const MobileMenu = ({ drawerState, navRoutes }) => <TemporaryDrawer drawerState={drawerState}>
  <MobileMenuStyle>
    <MobileCloseIconStyle>
      <IconButton onClick={() => drawerState[1](false)} >
        <CloseOutlined />
      </IconButton>
    </MobileCloseIconStyle>
    <NavigationItems column navRoutes={navRoutes} gap='2em' />
    <CTAStyle>
      Let's talk
      <br />
      <span> hello@pollinations.ai </span>
    </CTAStyle>
    <SocialLinks medium gap='1em' />
  </MobileMenuStyle>
</TemporaryDrawer>

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
`;

const MobileCloseIconStyle = styled.div`
position: absolute;
top: 1em;
right: 2em;
.MuiIconButton-root:hover {
  background-color: white;
  color: black;
}
`;

const CTAStyle = styled.p`
font-style: normal;
font-weight: 500;
font-size: 24px;
line-height: 36px;
text-align: center;
color: #FFFFFF;
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
  @media (max-width: ${MOBILE_BREAKPOINT}){
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
  .MuiTypography-colorPrimary{
    color: #fdfdfd !important;  
  }
  padding: 1% 0 2%; /* Added padding-bottom here */
  @media (max-width: ${MOBILE_BREAKPOINT}){
    grid-template-areas: "logo nav mobilebutton social";
  }
`
const MenuButton = styled.div`
  grid-area: mobilebutton;
  justify-self: flex-end;
  margin: 1em; /* Add this line */
  @media (min-width: ${MOBILE_BREAKPOINT}){
    display: none;
  }
  .MuiIconButton-root:hover {
    background-color: white; 
    filter: invert(100%);
  }
`

const StyledNavLink = styled(NavLink)`
  padding: 0;
  paddingRight: 80px;
  gridArea: logo;
  display: flex;
  alignItems: center;
  marginLeft: 1em;
`
export default TopBar

