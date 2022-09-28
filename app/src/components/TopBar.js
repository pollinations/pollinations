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
      

      <SocialLinks small/>

      <MenuButton>
        <IconButton onClick={()=>drawerState[1](true)} >
          <HamburgerIcon />
        </IconButton>
      </MenuButton>

    </NavBarStyle>
    </TopContainer>

    <TemporaryDrawer drawerState={drawerState}>
      <NavigationItems column navRoutes={navRoutes}/>
    </TemporaryDrawer>
  </>
};

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
  return ` 
    position: absolute;
    z-index: 1;`
};

export default TopBar
