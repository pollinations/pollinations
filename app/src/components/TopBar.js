import styled from '@emotion/styled'
import Button from '@material-ui/core/Button'
import Container from '@material-ui/core/Container'
import {useState} from 'react'
import {BigTitle} from './atoms/BigTitle'
import {HorizontalBorder} from './atoms/Borders'
import RouterLink from './molecules/RouterLink'
import {SocialLinks} from './Social'

import {
    Avatar,
    Dialog, DialogActions,
    DialogTitle,
    List,
    ListItem,
    ListItemAvatar, ListItemText
} from "@material-ui/core";
import { useAuth } from '../hooks/useAuth'
import { composeP } from 'ramda'


const MenuLinks = [
    // { children: 'models', to: '/models' },
    {children: 'about', to: '/about'},
    {children: 'feed', to: '/feed'},
    {children: 'help', to: '/help'},
    {children: 'my pollens', to: '/localpollens'},
]

const TopBar = ({ showNode }) => {
    const [open, setOpen] = useState(false)
    const [loginOpen, setLoginOpen] = useState(false)

    const {
        user,
        loginProviders, 
        handleSignOut,
        handleSignIn } = useAuth()

        console.log(user)

    return <Container maxWidth='lg'>

        <VisibleContentStyle>
            <BigTitle>
                <RouterLink to={"/"}>
                    pollinations.ai
                </RouterLink>
            </BigTitle>
            <span>
                {/*If current user is not null show the login button otherwise show the logout button. */}
                {(user === null) ?
                    <Button onClick={() => setLoginOpen(true)}>
                       [ Login ]
                    </Button>   
                    :
                    <Button onClick={handleSignOut}>
                        [ Logout ]
                    </Button>   
                    
                    
                }
                <Button onClick={() => setOpen(state => !state)}>
                [ Menu ]
            </Button>
            </span>


        </VisibleContentStyle>

        <HorizontalBorder/>

        <HiddenContentStyle open={open}>
            <MenuItems>
                {
                    MenuLinks
                        .map(linkProps => <li key={linkProps.to} onClick={() => setOpen(false)}>
                            <RouterLink {...linkProps}/>
                        </li>)
                }
                <SocialLinks style={{alignSelf: 'end'}}/>
            </MenuItems>
        </HiddenContentStyle>


        <Dialog open={loginOpen}>
            <DialogTitle>Login</DialogTitle>
            <List sx={{pt: 0}}>
                {loginProviders?.map((provider) => (
                    <ListItem button onClick={() => handleSignIn(provider)} key={provider}>
                        <ListItemAvatar>
                            <Avatar src={`/socials/${provider}.png`}/>
                        </ListItemAvatar>
                        <ListItemText primary={provider}/>
                    </ListItem>
                ))}
            </List>
            <DialogActions>
                <Button onClick={() => setLoginOpen(state => !state)}>Close</Button>
            </DialogActions>
        </Dialog>
    </Container>
}

const LogOutButton = ({ signOut, getCurrentUser }) => {

 

    return <>
        
    </>
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