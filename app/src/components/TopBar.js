import styled from '@emotion/styled'
import Button from '@material-ui/core/Button'
import Container from '@material-ui/core/Container'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { BigTitle } from './atoms/BigTitle'
import { HorizontalBorder } from './atoms/Borders'
import RouterLink from './molecules/RouterLink'
import LoggedUser from './organisms/LoggedUser'
import LoginDialog from './organisms/LoginDialog'
import { SocialLinks } from './Social'




const MenuLinks = [
    // { children: 'models', to: '/models' },
    {children: 'about', to: '/about'},
    {children: 'feed', to: '/feed'},
    {children: 'help', to: '/help'},
    // {children: 'my pollens', to: '/localpollens'},
]

const isLoginEnabled = false;

const TopBar = () => {
    const [open, setOpen] = useState(false)
    const isLoginDialogOpen = useState(false)

    const { user } = useAuth()

    return <Container maxWidth='lg'>
        

        <VisibleContentStyle>
            <BigTitle>
                <RouterLink to={"/"}>
                    pollinations.ai
                </RouterLink>
            </BigTitle>
            <div style={{display: 'flex', gap: '1em'}}>
                {
                    user === null && isLoginEnabled &&
                    <Button onClick={() => isLoginDialogOpen[1](true)}>
                       [ Login ]
                    </Button>   
                }
                <Button onClick={() => setOpen(state => !state)}>
                    [ Menu ]
                </Button>

                { user !== null && isLoginEnabled && <LoggedUser user={user}/> }
            </div>
        </VisibleContentStyle>

        <HorizontalBorder/>

        <HiddenContentStyle open={open}>
            <MenuItems>
                {
                    MenuLinks.map(linkProps => 
                    <li key={linkProps.to} onClick={() => setOpen(false)}>
                        <RouterLink {...linkProps}/>
                    </li>)
                }
                <SocialLinks style={{alignSelf: 'end'}}/>
            </MenuItems>
        </HiddenContentStyle>

        <LoginDialog state={isLoginDialogOpen} />

    </Container>
}

const VisibleContentStyle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`

const HiddenContentStyle = styled.div`
  width: 100%;
  height: ${props => props.open ? '0px' : 'auto'};
  transition: height 0.1s ease-in;

  padding: 0.1em 1em;
  overflow-y: hidden;
  background-color: transparent;
  text-transform: uppercase;

  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(90vw / 6), 1fr));
  align-items: center;
`

const MenuItems = styled.ul`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  list-style: none;

  li {

  }
`

export default TopBar