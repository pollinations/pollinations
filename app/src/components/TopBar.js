import styled from '@emotion/styled'
import Button from '@material-ui/core/Button'
import Container from '@material-ui/core/Container'
import {useState} from 'react'
import {BigTitle} from './atoms/BigTitle'
import {HorizontalBorder} from './atoms/Borders'
import RouterLink from './molecules/RouterLink'
import {SocialLinks} from './Social'

import {
    Avatar, MenuItem,
    Dialog, DialogActions,
    DialogTitle,
    List,
    ListItem,
    ListItemAvatar, ListItemText, Menu, 
} from "@material-ui/core";
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'


const MenuLinks = [
    // { children: 'models', to: '/models' },
    {children: 'about', to: '/about'},
    {children: 'feed', to: '/feed'},
    {children: 'help', to: '/help'},
    {children: 'my pollens', to: '/localpollens'},
]

const TopBar = () => {
    const [open, setOpen] = useState(false)
    const [loginOpen, setLoginOpen] = useState(false)

    const {
        user,
        loginProviders, 
        handleSignIn } = useAuth()


    return <Container maxWidth='lg'>

        <VisibleContentStyle>
            <BigTitle>
                <RouterLink to={"/"}>
                    pollinations.ai
                </RouterLink>
            </BigTitle>
            <div style={{display: 'flex', gap: '1em'}}>
                {
                    user === null &&
                    <Button onClick={() => setLoginOpen(true)}>
                       [ Login ]
                    </Button>   
                }
                <Button onClick={() => setOpen(state => !state)}>
                    [ Menu ]
                </Button>
                {
                    user !== null &&  <LoggedUser user={user}/>
                }
            </div>
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


const LoggedUser = ({ user }) => {
    const { handleSignOut } = useAuth()
    const navigate = useNavigate()
    
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);
 
    return <>
        <Avatar onClick={e => setAnchorEl(e.currentTarget)} src={user?.user_metadata?.avatar_url}/>
        <Menu  anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} style={{marginTop: '2em'}}>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                navigate("profile")
            }} > Profile </MenuItem>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                navigate("localpollens")
            }}> My Pollens </MenuItem>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                handleSignOut()
            }}> Logout </MenuItem>

      </Menu>
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