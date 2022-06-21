import styled from '@emotion/styled'
import { MOBILE_BREAKPOINT } from '../../styles/global'
import RouterLink from '../molecules/RouterLink'



const HorizontalNav = ({ navRoutes, direction }) =>{

    return <MenuItems direction={direction || 'row'}>
    {
        Object.keys(navRoutes).map((key) => (
        <RouterLink key={key} to={navRoutes[key].to}>
            {navRoutes[key].label}
        </RouterLink>
    ))}
    </MenuItems>
}

export default HorizontalNav

const MenuItems = styled.div`
display: flex;
flex-direction: ${props => props.direction};
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