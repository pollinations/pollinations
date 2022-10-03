import IconButton from "@material-ui/core/IconButton"
import React from "react"
import { NavLink, useLocation } from "react-router-dom"
import TemporaryDrawer from "./Drawer"

import styled from "@emotion/styled"
import { GlobalSidePadding, MOBILE_BREAKPOINT } from "../styles/global"

import HamburgerIcon from '@material-ui/icons/Menu'
import { FlexBetween } from "../styles/classes"
import Logo from './Logo'
import NavigationItems from "./organisms/NavigationItems"
import { SocialLinks } from './Social'
import { CloseOutlined } from "@material-ui/icons"
import MobileMenuIcon from '../assets/menuIcon.svg'


const TopBar = ({ navRoutes }) => {

  const drawerState = React.useState(false);
  const location = useLocation();

  
  return <>
    <TopContainer css={StyleUrl(location.pathname)}>
    {/* <Alert severity="info">So much pollinating going on that diffusion may be unstable for a little while. Join our <a href='https://discord.gg/XXd99CrkCr'>discord</a> for a chat, help or updates.</Alert> 
     */}
    <NavBarStyle>
      <NavLink to='/' style={{ padding: 0, gridArea: 'logo', display: 'flex', alignItems: 'center', marginLeft: '1em' }}>
        <Logo size='150px' small='150px' margin='0' />  
      </NavLink>

      <NavigationItems navRoutes={navRoutes}/>
      

      <SocialLinks small hideOnMobile gap='1em'/>

      <MenuButton>
        <IconButton onClick={()=>drawerState[1](true)} >
          <img src={MobileMenuIcon}/>
        </IconButton>
      </MenuButton>

    </NavBarStyle>
    </TopContainer>

    <TemporaryDrawer drawerState={drawerState}>
      <MobileMenuStyle>
        <MobileCloseIconStyle>
          <IconButton onClick={()=>drawerState[1](false)}>
            <CloseOutlined />
          </IconButton>
        </MobileCloseIconStyle>

        <NavigationItems column navRoutes={navRoutes} margin='5em 0 0 0' gap='2em'/>
        <div >
          <CTAStyle>
              Let's talk 
              <br/>
              <span> hello@pollinations.ai </span>
          </CTAStyle>
          <SocialLinks small gap='1em' />
        </div>
      </MobileMenuStyle>
    </TemporaryDrawer>
  </>
};
const MobileMenuStyle = styled.div`
position: relative;
width: 100%;
height: 100%;

display: flex;
flex-direction: column;
justify-content: space-evenly;
align-items: center;

padding: 20px 10px 60px;
`;
const MobileCloseIconStyle = styled.div`
position: absolute;
top: 20;
right: 20;
`;
const CTAStyle = styled.p`

font-family: 'DM Sans';
font-style: normal;
font-weight: 500;
font-size: 18px;
line-height: 23px;
text-align: center;

color: #FFFFFF;
padding-bottom: 0em;

span {
    color: #E9FA29;
}
`
const TopContainer = styled.div`
  ${props => props.css};
  width: 100%;
`

const NavBarStyle = styled.div`

  display: grid;
  grid-template-columns: 1fr 3fr 1fr;
  grid-template-rows: auto;
  grid-template-areas: "logo nav social";
  align-content: center;
  gap: 1em;

  font-size: 1rem;
  .MuiTypography-colorPrimary{
    color: #fdfdfd !important;  
  }
  padding: ${GlobalSidePadding};
  padding: 1% 3%;
  @media (max-width: ${MOBILE_BREAKPOINT}){
    grid-template-areas: "logo nav mobilebutton social";
  }
`
const MenuButton = styled.div`
grid-area: mobilebutton;
justify-self: flex-end;
@media (min-width: ${MOBILE_BREAKPOINT}){
  display: none;
}
`

const StyleUrl = (url) => {
  if (url?.slice(0,2) === '/c') return `position: relative;`;
  if (url?.slice(0,2) === '/p') return `position: relative;`;
  if (url?.slice(0,2) === '/n') return `position: relative;`;
  return ` 
    position: absolute;
    z-index: 1;`
};

export default TopBar
