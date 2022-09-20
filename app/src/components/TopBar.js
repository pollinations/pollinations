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


const TopBar = ({ navRoutes }) => {

  const drawerState = React.useState(false);
  const location = useLocation();

  
  return <>
    <TopContainer position={location.pathname === '/' ? 'absolute' : 'relative'}>
    {/* <Alert severity="info">So much pollinating going on that diffusion may be unstable for a little while. Join our <a href='https://discord.gg/XXd99CrkCr'>discord</a> for a chat, help or updates.</Alert> 
     */}
      <NavBarStyle>
      <NavLink to='/' style={{ padding: 0 }}>
        <Logo size='150px' small='150px' margin='0' />  
      </NavLink>

      <NavigationItems navRoutes={navRoutes}/>
      

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
  position: ${props => props.position};
  width: 100%;
  `
  const NavBarStyle = styled.div`
  ${FlexBetween}
  font-size: 1rem;
  .MuiTypography-colorPrimary{
  color: #fdfdfd !important;  
  }
  padding: ${GlobalSidePadding}
`




const MenuButton = styled.div`
@media only screen and (min-width: ${MOBILE_BREAKPOINT}){
  display: none;
}
`

export default TopBar
