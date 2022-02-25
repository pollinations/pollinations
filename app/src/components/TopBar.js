import styled from '@emotion/styled'
import Button from '@material-ui/core/Button'
import Container from '@material-ui/core/Container'
import { useState } from 'react'
import { BigTitle } from './atoms/BigTitle'
import { HorizontalBorder } from './atoms/Borders'
import RouterLink from './molecules/RouterLink'
import { SocialLinks } from './Social'



const MenuLinks = [
  // { children: 'models', to: '/models' },
  { children: 'about', to: '/about' },
  { children: 'feed', to: '/feed' },
  { children: 'help', to: '/help' },
  { children: 'my pollens', to: '/localpollens' },
]

const TopBar = ({ showNode }) => {
    const [open, setOpen] = useState(false)

    return <Container maxWidth='lg'>

        <VisibleContentStyle>
            <BigTitle>
                <RouterLink to={"/"}>
                    pollinations.ai
                </RouterLink>
            </BigTitle>
            <Button onClick={()=> setOpen(state=>!state)}>
                [ Menu ]
            </Button>
        </VisibleContentStyle>

        <HorizontalBorder />

        <HiddenContentStyle open={open}>
            <MenuItems> 
            {
                MenuLinks
                .map( linkProps => <li key={linkProps.to} onClick={() => setOpen(false)}>
                    <RouterLink {...linkProps}/>
                </li>)
            }
            <SocialLinks style={{ alignSelf: 'end' }}/>
            </MenuItems>
        </HiddenContentStyle>
        
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