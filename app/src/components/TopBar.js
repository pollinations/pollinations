import React from "react"
import { NavLink, useLocation } from "react-router-dom"
import IconButton from "@material-ui/core/IconButton"
import TemporaryDrawer from "./Drawer"

import styled from "@emotion/styled"
import { GlobalSidePadding, MOBILE_BREAKPOINT } from "../styles/global"

import Logo from './Logo'
import HamburgerIcon from '@material-ui/icons/Menu'
import NavigationItems from "./organisms/NavigationItems"
import { FlexBetween } from "../styles/classes"


const TopBar = ({ navRoutes }) => {

  const drawerState = React.useState(false);
  const location = useLocation();
  console.log(location.pathname === '/')

  return <>
    <TopContainer position={location.pathname === '/' ? 'absolute' : 'relative'}>

      <NavLink to='/' style={{ padding: 0 }}>
        <Logo size='180px' small='150px' margin='0' />  
      </NavLink>

      <NavigationItems navRoutes={navRoutes}/>
      

      <MenuButton>
        <IconButton onClick={()=>drawerState[1](true)} >
          <HamburgerIcon />
        </IconButton>
      </MenuButton>

    </TopContainer>

    <TemporaryDrawer drawerState={drawerState}>
      <NavigationItems column navRoutes={navRoutes}/>
    </TemporaryDrawer>
  </>
};

const TopContainer = styled.div`
  position: ${props => props.position};
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
