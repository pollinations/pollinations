import styled from "@emotion/styled"
import Container from "@material-ui/core/Container"
import { HorizontalBorder } from "./atoms/Borders"
import RouterLink from "./molecules/RouterLink"
import { SocialLinks } from "./Social"
import Logo from './Logo'
import { NavLink } from "react-router-dom"
import { IconButton } from "@material-ui/core"
import HamburgerIcon from '@material-ui/icons/Menu'
import TemporaryDrawer from "./Drawer"
import React from "react"

const TopBar = ({ navRoutes }) => {

  const drawerState = React.useState(false);


  const NavList = Object.keys(navRoutes).map((key) => (
    <li key={key}>
        <RouterLink to={navRoutes[key].to}>
            {navRoutes[key].label}
        </RouterLink>
    </li>
  ));

  return (
<>
      <TopContainer>
        <NavLink to='/' style={{ padding: 0 }}>
            <Logo size='180px' small='150px' margin='0' />  
        </NavLink>
        <MenuItems>
            {NavList}
        </MenuItems>
        <MenuButton>
          <IconButton>
            <HamburgerIcon onClick={()=>drawerState[1](true)} />
          </IconButton>
        </MenuButton>
      </TopContainer>
      <TemporaryDrawer drawerState={drawerState}>
        {NavList}
      </TemporaryDrawer>

</>
  )
}

const TopContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const MOBILE_BREAKPOINT = '768px'


const MenuItems = styled.div`
display: flex;
justify-content: flex-end;
align-items: center;
width: 100%;
list-style: none;
gap: 2em;
padding: 0.5em 0em;
overflow-y: hidden;
background-color: transparent;
text-transform: uppercase;

@media only screen and (max-width: ${MOBILE_BREAKPOINT}){
display: none;
}
`
const MenuButton = styled.div`
@media only screen and (min-width: ${MOBILE_BREAKPOINT}){
  display: none;
}
`

export default TopBar
