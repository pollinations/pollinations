import styled from "@emotion/styled"
import Container from "@material-ui/core/Container"
import { HorizontalBorder } from "./atoms/Borders"
import RouterLink from "./molecules/RouterLink"
import { SocialLinks } from "./Social"
import Logo from './Logo'
import { NavLink } from "react-router-dom"

const TopBar = ({ navRoutes }) => {

  return (
    <Container maxWidth="lg">

        <TopContainer>
            <NavLink to='/' style={{ padding: 0 }}>
                <Logo size='200px' small='150px' margin='0' />  
            </NavLink>
            <SocialLinks style={{ alignSelf: "end" }} />
            {/* <Button onClick={() => setOpen((state) => !state)}>[ Menu ]</Button> */}
        </TopContainer>

        <HorizontalBorder margin='0' />

        <MenuItems>
            {Object.keys(navRoutes).map((key) => (
                <li key={key}>
                    <RouterLink to={navRoutes[key].to}>
                        {navRoutes[key].label}
                    </RouterLink>
                </li>
            ))}
        </MenuItems>

    </Container>    
  )
}

const TopContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const MenuItems = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  list-style: none;
  gap: 2em;
  padding: 0.5em 1em;
  overflow-y: hidden;
  background-color: transparent;
  text-transform: uppercase;

  @media only screen and (max-width: 300px){
    justify-content: space-between;
  }
`

export default TopBar
